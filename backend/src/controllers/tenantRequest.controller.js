import crypto from "crypto";
import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import TenantRequest from "../models/TenantRequest.js";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog.js";
import Notification from "../models/Notification.js";
import { User } from "../models/User.js";
import { ENV } from "../config/env.js";
import { isValidTenantSlug } from "../config/slugPolicy.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  sendTenantAdminWelcomeEmail,
  sendTenantRequestRejectedEmail,
  sendTenantRequestReceivedEmail,
  sendTenantRequestVerificationEmail,
} from "../utils/email.js";
import {
  notifyAutomaticTenantSignup,
  notifyVerifiedTenantRequest,
} from "../utils/superAdminNotifications.js";

const verificationLifetimeMs = 24 * 60 * 60 * 1000;
const trialPeriodMs = 14 * 24 * 60 * 60 * 1000;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const signupMode = () => {
  if (!["approval", "auto"].includes(ENV.TENANT_SIGNUP_MODE)) {
    throw new ApiError(
      500,
      "TENANT_SIGNUP_MODE must be set to approval or auto",
    );
  }
  return ENV.TENANT_SIGNUP_MODE;
};

const isTransactionUnavailable = (error) =>
  error.code === 20 ||
  (error.codeName === "IllegalOperation" &&
    /transaction numbers are only allowed|replica set|mongos/i.test(
      error.message,
    ));

const buildTenantData = (request) => ({
  name: request.companyName,
  slug: request.slug,
  status: "trial",
  plan: "free",
  employeeLimitOverride: null,
  trialEndsAt: new Date(Date.now() + trialPeriodMs),
  onboarding: { completed: false, step: 1 },
});

const buildAdminData = (tenantId, request, password) => ({
  tenantId,
  employeeId: `HR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
  name: request.contactName,
  email: request.email,
  password,
  role: "admin",
  emailVerified: true,
  mustChangePassword: true,
});

export const createTenantRequestAccount = async (request) => {
  const password = crypto.randomBytes(18).toString("base64url");
  let session;
  try {
    session = await mongoose.startSession();
    let tenant;
    let admin;
    await session.withTransaction(async () => {
      [tenant] = await Tenant.create([buildTenantData(request)], { session });
      [admin] = await User.create(
        [buildAdminData(tenant._id, request, password)],
        { session },
      );
    });
    return { tenant, admin, password };
  } catch (error) {
    if (!isTransactionUnavailable(error)) throw error;
  } finally {
    await session?.endSession();
  }

  const tenant = await Tenant.create(buildTenantData(request));
  try {
    const admin = await User.create(
      buildAdminData(tenant._id, request, password),
    );
    return { tenant, admin, password };
  } catch (error) {
    await Tenant.deleteOne({ _id: tenant._id });
    throw error;
  }
};

export const removeTenantRequestAccount = async ({ tenant, admin }) => {
  if (admin) {
    await User.deleteOne({ _id: admin._id, tenantId: tenant._id });
  }
  await Tenant.deleteOne({ _id: tenant._id });
};

const emailAdminCredentials = async ({ tenant, admin, password }) => {
  await sendTenantAdminWelcomeEmail({
    name: admin.name,
    email: admin.email,
    password,
    companySlug: tenant.slug,
  });
};

export const checkRequestedSlugAvailability = asyncHandler(
  async (req, res) => {
    const slug = req.query.slug;
    if (!isValidTenantSlug(slug)) {
      return ApiResponse.send(
        res,
        200,
        { available: false, reason: "invalid-or-reserved" },
        "Company code is unavailable",
      );
    }

    const [tenantExists, pendingRequestExists] = await Promise.all([
      Tenant.exists({ slug }),
      TenantRequest.exists({ slug, status: "pending" }),
    ]);
    const available = !tenantExists && !pendingRequestExists;
    return ApiResponse.send(
      res,
      200,
      {
        available,
        reason: available ? null : "taken",
      },
      available ? "Company code is available" : "Company code is already in use",
    );
  },
);

export const submitTenantRequest = asyncHandler(async (req, res) => {
  const mode = signupMode();
  if (req.body.website?.trim()) {
    throw new ApiError(400, "Unable to process signup request");
  }

  const email = req.body.email.trim().toLowerCase();
  const slug = req.body.slug.trim().toLowerCase();
  const [tenantExists, pendingEmailExists, pendingSlugExists] =
    await Promise.all([
      Tenant.exists({ slug }),
      TenantRequest.exists({ email, status: "pending" }),
      TenantRequest.exists({ slug, status: "pending" }),
    ]);
  if (tenantExists || pendingEmailExists || pendingSlugExists) {
    throw new ApiError(409, "That company code or email already has a request");
  }

  const token = crypto.randomBytes(32).toString("hex");
  let tenantRequest;
  try {
    tenantRequest = await TenantRequest.create({
      companyName: req.body.companyName,
      slug,
      contactName: req.body.contactName,
      email,
      phone: req.body.phone,
      employeeCountEstimate: req.body.employeeCountEstimate,
      message: req.body.message || "",
      status: "pending",
      emailVerified: false,
      emailVerificationToken: hashToken(token),
      emailVerificationExpires: new Date(Date.now() + verificationLifetimeMs),
      ipAddress: req.ip || "",
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "That company code or email already has a request");
    }
    throw error;
  }

  let deliveryError;
  try {
    await sendTenantRequestVerificationEmail({
      contactName: tenantRequest.contactName,
      email: tenantRequest.email,
      token,
    });
  } catch (error) {
    deliveryError = error;
  }
  try {
    await sendTenantRequestReceivedEmail({
      contactName: tenantRequest.contactName,
      email: tenantRequest.email,
    });
  } catch (error) {
    deliveryError ||= error;
  }
  if (deliveryError) {
    await TenantRequest.deleteOne({ _id: tenantRequest._id });
    console.error("[Tenant Request] Email delivery failed", deliveryError);
    throw new ApiError(
      502,
      "We could not send your request emails. Please try again.",
    );
  }

  return ApiResponse.send(
    res,
    201,
    { email: tenantRequest.email, mode },
    "Request received. Check your email to verify your address.",
  );
});

export const verifyTenantRequestEmail = asyncHandler(async (req, res) => {
  const mode = signupMode();
  const tokenHash = hashToken(req.query.token);
  const request = await TenantRequest.findOne({
    emailVerificationToken: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
    emailVerified: false,
    status: "pending",
  }).select("+emailVerificationToken +emailVerificationExpires");
  if (!request) {
    throw new ApiError(400, "Invalid or expired request verification link");
  }

  if (mode === "approval") {
    const result = await TenantRequest.updateOne(
      {
        _id: request._id,
        status: "pending",
        emailVerified: false,
        emailVerificationToken: tokenHash,
        emailVerificationExpires: { $gt: new Date() },
      },
      {
        $set: { emailVerified: true },
        $unset: {
          emailVerificationToken: 1,
          emailVerificationExpires: 1,
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new ApiError(400, "Invalid or expired request verification link");
    }
    await notifyVerifiedTenantRequest(request);
    return ApiResponse.send(
      res,
      200,
      { mode, status: "pending" },
      "Your email is verified and your request is awaiting review",
    );
  }

  let account;
  try {
    account = await createTenantRequestAccount(request);
    await emailAdminCredentials(account);
    const result = await TenantRequest.updateOne(
      {
        _id: request._id,
        status: "pending",
        emailVerified: false,
        emailVerificationToken: tokenHash,
      },
      {
        $set: {
          emailVerified: true,
          status: "approved",
          tenantId: account.tenant._id,
          reviewedAt: new Date(),
        },
        $unset: {
          emailVerificationToken: 1,
          emailVerificationExpires: 1,
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new ApiError(409, "This request has already been processed");
    }
    await notifyVerifiedTenantRequest(request);
    await notifyAutomaticTenantSignup(request, account.tenant);
  } catch (error) {
    if (account) {
      await removeTenantRequestAccount(account);
    }
    if (error.code === 11000) {
      throw new ApiError(409, "The company code or administrator email is already in use");
    }
    if (error instanceof ApiError) throw error;
    console.error("[Tenant Request] Automatic provisioning failed", error);
    throw new ApiError(
      502,
      "Your email was verified, but workspace provisioning could not be completed. Contact support.",
    );
  }

  return ApiResponse.send(
    res,
    200,
    {
      mode,
      status: "approved",
      companySlug: account.tenant.slug,
    },
    "Your email is verified and your workspace is ready",
  );
});

export const getTenantRequests = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const filter = {
    status: req.query.status || "pending",
    emailVerified: true,
  };
  if (req.query.search) {
    const search = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { companyName: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
      { contactName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  const [requests, total] = await Promise.all([
    TenantRequest.find(filter)
      .select(
        "companyName slug contactName email phone employeeCountEstimate message status emailVerified rejectionReason tenantId reviewedAt createdAt",
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TenantRequest.countDocuments(filter),
  ]);
  return ApiResponse.send(
    res,
    200,
    {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Tenant requests retrieved",
  );
});

export const getTenantRequest = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tenant request ID");
  }
  const tenantRequest = await TenantRequest.findOne({
    _id: req.params.id,
    emailVerified: true,
  }).lean();
  if (!tenantRequest) {
    throw new ApiError(404, "Verified tenant request not found");
  }

  return ApiResponse.send(res, 200, tenantRequest, "Tenant request retrieved");
});

export const approveTenantRequest = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tenant request ID");
  }

  const password = crypto.randomBytes(18).toString("base64url");
  const plan = req.body.plan || "free";
  const trialDays = req.body.trialDays ?? 14;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  let session;
  let account;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const tenantRequest = await TenantRequest.findOne({
        _id: req.params.id,
        status: "pending",
        emailVerified: true,
      }).session(session);
      if (!tenantRequest) {
        throw new ApiError(409, "This request has already been processed");
      }

      const tenantData = {
        ...buildTenantData(tenantRequest),
        plan,
        employeeLimitOverride: req.body.employeeLimit ?? null,
        trialEndsAt,
      };
      const [tenant] = await Tenant.create([tenantData], { session });
      const [admin] = await User.create(
        [
          buildAdminData(tenant._id, tenantRequest, password),
        ],
        { session },
      );
      const result = await TenantRequest.updateOne(
        {
          _id: tenantRequest._id,
          status: "pending",
          emailVerified: true,
        },
        {
          $set: {
            status: "approved",
            tenantId: tenant._id,
            reviewedBy: req.superAdmin._id,
            reviewedAt: new Date(),
          },
        },
        { session },
      );
      if (result.modifiedCount !== 1) {
        throw new ApiError(409, "This request has already been processed");
      }
      account = { tenant, admin, password, request: tenantRequest };
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "The company code or administrator email is already in use");
    }
    if (error instanceof ApiError) throw error;
    if (isTransactionUnavailable(error)) {
      throw new ApiError(
        503,
        "Tenant approval requires MongoDB transactions; the request was not changed",
      );
    }
    console.error("[Tenant Request] Approval transaction failed", error);
    throw new ApiError(502, "Tenant approval failed; the request was not changed");
  } finally {
    await session?.endSession();
  }

  if (!account) {
    throw new ApiError(409, "This request has already been processed");
  }

  try {
    await emailAdminCredentials(account);
  } catch (error) {
    console.error("[Tenant Request] Welcome email delivery failed", error);
    throw new ApiError(
      502,
      "The tenant was created, but the welcome email could not be sent",
    );
  }

  if (req.superAdminAuditLogId) {
    await SuperAdminAuditLog.updateOne(
      { _id: req.superAdminAuditLogId, who: req.superAdmin._id },
      { $set: { tenantId: account.tenant._id } },
    );
  }

  return ApiResponse.send(
    res,
    200,
    {
      id: account.request._id,
      status: "approved",
      tenant: {
        id: account.tenant._id,
        name: account.tenant.name,
        slug: account.tenant.slug,
      },
    },
    "Tenant request approved and workspace credentials emailed",
  );
});

export const rejectTenantRequest = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tenant request ID");
  }
  const reviewedAt = new Date();
  const tenantRequest = await TenantRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "pending",
      emailVerified: true,
    },
    {
      $set: {
        status: "rejected",
        rejectionReason: req.body.reason,
        reviewedBy: req.superAdmin._id,
        reviewedAt,
      },
    },
    { new: true },
  );
  if (!tenantRequest) {
    throw new ApiError(409, "This request has already been processed");
  }
  await sendTenantRequestRejectedEmail({
    contactName: tenantRequest.contactName,
    email: tenantRequest.email,
    rejectionReason: req.body.reason,
  });
  return ApiResponse.send(
    res,
    200,
    { id: tenantRequest._id, status: "rejected" },
    "Tenant request rejected",
  );
});

export const getSuperAdminNotifications = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const filter = {
    $or: [{ superAdminId: null }, { superAdminId: req.superAdmin._id }],
  };
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ ...filter, isRead: false }),
  ]);
  return ApiResponse.send(
    res,
    200,
    { notifications, unreadCount },
    "Notifications retrieved",
  );
});

export const markSuperAdminNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid notification ID");
  }
  const filter = {
    _id: req.params.id,
    $or: [{ superAdminId: null }, { superAdminId: req.superAdmin._id }],
  };
  const notification = await Notification.findOneAndUpdate(
    filter,
    { $set: { isRead: true } },
    { new: true },
  ).lean();
  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }
  return ApiResponse.send(res, 200, notification, "Notification marked as read");
});

export const markAllSuperAdminNotificationsRead = asyncHandler(
  async (req, res) => {
    const filter = {
      isRead: false,
      $or: [{ superAdminId: null }, { superAdminId: req.superAdmin._id }],
    };
    const result = await Notification.updateMany(filter, {
      $set: { isRead: true },
    });
    return ApiResponse.send(
      res,
      200,
      { modifiedCount: result.modifiedCount },
      "All notifications marked as read",
    );
  },
);
