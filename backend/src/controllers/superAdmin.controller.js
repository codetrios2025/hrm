import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import Tenant from "../models/Tenant.js";
import SuperAdmin from "../models/SuperAdmin.js";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog.js";
import { ENV } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  sendTenantAdminWelcomeEmail,
} from "../utils/email.js";
import { runWithTenantQueryBypass } from "../plugins/tenantQueryGuard.js";
import { PLANS } from "../config/plans.js";
import { getEffectiveEmployeeLimit } from "../utils/tenantLimits.js";

const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;

const validateTenantId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid tenant ID");
  }
};

const slugFromName = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const findTenantOrThrow = async (id) => {
  validateTenantId(id);
  const tenant = await Tenant.findById(id).lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");
  return tenant;
};

const getEmployeeCountsByTenant = (tenantIds) =>
  runWithTenantQueryBypass("super-admin", async () =>
    await User.aggregate([
      {
        $match: {
          tenantId: { $in: tenantIds },
          role: { $ne: "admin" },
          isActive: { $ne: false },
        },
      },
      { $group: { _id: "$tenantId", count: { $sum: 1 } } },
    ]).option({ allowCrossTenant: true }),
  );

export const superAdminLogin = asyncHandler(async (req, res) => {
  if (!ENV.SUPER_JWT_SECRET) {
    throw new ApiError(500, "SUPER_JWT_SECRET is not configured");
  }

  const admin = await SuperAdmin.findOne({
    email: req.body.email.trim().toLowerCase(),
  }).select("+password");
  if (!admin || !(await admin.isPasswordCorrect(req.body.password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = jwt.sign(
    { id: admin._id, type: "super" },
    ENV.SUPER_JWT_SECRET,
    { expiresIn: ENV.SUPER_JWT_EXPIRES_IN },
  );
  await SuperAdminAuditLog.create({
    who: admin._id,
    action: "POST /api/super/auth/login",
  });

  return ApiResponse.send(
    res,
    200,
    {
      token,
      superAdmin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    },
    "Super Admin login successful",
  );
});

export const getTenants = asyncHandler(async (req, res) => {
  const { page, limit, search, status, plan } = req.query;
  const filter = {};
  if (status) filter.status = status;
  else filter.status = { $ne: "deleted" };
  if (plan) filter.plan = plan;
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escapedSearch, $options: "i" } },
      { slug: { $regex: escapedSearch, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const [tenants, total] = await Promise.all([
    Tenant.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Tenant.countDocuments(filter),
  ]);
  const employeeCounts = await getEmployeeCountsByTenant(
    tenants.map(({ _id }) => _id),
  );
  const countsByTenant = new Map(
    employeeCounts.map(({ _id, count }) => [String(_id), count]),
  );

  return ApiResponse.send(
    res,
    200,
    {
      tenants: tenants.map((tenant) => ({
        ...tenant,
        employeeCount: countsByTenant.get(String(tenant._id)) || 0,
        planEmployeeLimit: PLANS[tenant.plan].employeeLimit,
        employeeLimitOverride: tenant.employeeLimitOverride ?? null,
        effectiveEmployeeLimit: getEffectiveEmployeeLimit(tenant),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Tenants retrieved",
  );
});

export const getTenantAuditHistory = asyncHandler(async (req, res) => {
  validateTenantId(req.params.id);
  const { page, limit } = req.query;
  const filter = { tenantId: req.params.id };
  const [auditHistory, total] = await Promise.all([
    SuperAdminAuditLog.find(filter)
      .sort({ time: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("who", "name email")
      .lean(),
    SuperAdminAuditLog.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      auditHistory,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Tenant audit history retrieved",
  );
});

export const createTenant = asyncHandler(async (req, res) => {
  const {
    name,
    status = "active",
    plan = "free",
    trialEndsAt,
    adminName,
    adminEmail,
  } = req.body;
  const slug = (req.body.slug || slugFromName(name)).toLowerCase();
  if (!slug) throw new ApiError(400, "A valid company code could not be generated");

  if (await Tenant.findOne({ slug })) {
    throw new ApiError(409, "Company code is already in use");
  }

  let tenant;
  try {
    tenant = await Tenant.create({
      name,
      slug,
      status,
      plan,
      employeeLimitOverride: null,
      onboarding: { completed: false, step: 1 },
      trialEndsAt:
        status === "trial"
          ? trialEndsAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          : null,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "Company code is already in use");
    }
    throw error;
  }

  const temporaryPassword = crypto.randomBytes(12).toString("hex");
  let adminUser;
  try {
    adminUser = await User.create({
      tenantId: tenant._id,
      employeeId: `HR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      name: adminName,
      email: adminEmail.trim().toLowerCase(),
      password: temporaryPassword,
      role: "admin",
    });
  } catch (error) {
    await Tenant.deleteOne({ _id: tenant._id });
    throw error;
  }

  try {
    await sendTenantAdminWelcomeEmail({
      name: adminUser.name,
      email: adminUser.email,
      password: temporaryPassword,
      companySlug: tenant.slug,
    });
  } catch (error) {
    try {
      await User.deleteOne({ _id: adminUser._id, tenantId: tenant._id });
      await Tenant.deleteOne({ _id: tenant._id });
    } catch (cleanupError) {
      console.error(
        "[Super Admin] Tenant provisioning rollback failed",
        cleanupError,
      );
    }
    console.error("[Super Admin] Tenant welcome email failed", error);
    throw new ApiError(
      502,
      "Welcome email failed; tenant provisioning was rolled back",
    );
  }

  if (req.superAdminAuditLogId) {
    await SuperAdminAuditLog.updateOne(
      { _id: req.superAdminAuditLogId, who: req.superAdmin._id },
      { $set: { tenantId: tenant._id } },
    );
  }

  return ApiResponse.send(
    res,
    201,
    {
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        employeeLimitOverride: null,
        planEmployeeLimit: PLANS[tenant.plan].employeeLimit,
        effectiveEmployeeLimit: getEffectiveEmployeeLimit(tenant),
      },
      admin: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        employeeId: adminUser.employeeId,
      },
    },
    "Tenant and first HR Administrator created",
  );
});

export const getTenantDetails = asyncHandler(async (req, res) => {
  const tenant = await findTenantOrThrow(req.params.id);
  const [employeeCount, lastLogin] = await Promise.all([
    User.countDocuments({
      tenantId: tenant._id,
      role: { $ne: "admin" },
      isActive: { $ne: false },
    }),
    User.findOne({
      tenantId: tenant._id,
      lastLoginAt: { $ne: null },
    })
      .sort({ lastLoginAt: -1 })
      .select("lastLoginAt")
      .lean(),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      tenant,
      usage: {
        employeeCount,
        planEmployeeLimit: PLANS[tenant.plan].employeeLimit,
        employeeLimitOverride: tenant.employeeLimitOverride ?? null,
        effectiveEmployeeLimit: getEffectiveEmployeeLimit(tenant),
        lastLoginAt: lastLogin?.lastLoginAt ?? null,
        createdAt: tenant.createdAt,
      },
    },
    "Tenant details retrieved",
  );
});

export const updateTenant = asyncHandler(async (req, res) => {
  validateTenantId(req.params.id);
  const currentTenant = await findTenantOrThrow(req.params.id);
  const planChanged =
    req.body.plan !== undefined && req.body.plan !== currentTenant.plan;
  const hasOverride = Object.hasOwn(req.body, "employeeLimitOverride");
  const updates = { ...req.body };
  if (planChanged && !hasOverride) {
    updates.employeeLimitOverride = null;
  }
  const oldPlan = currentTenant.plan;
  const oldOverride = currentTenant.employeeLimitOverride ?? null;
  const updatedPlan = updates.plan ?? currentTenant.plan;
  const updatedOverride = Object.hasOwn(updates, "employeeLimitOverride")
    ? updates.employeeLimitOverride
    : currentTenant.employeeLimitOverride ?? null;
  const planOrLimitChanged =
    planChanged ||
    (hasOverride && oldOverride !== (updatedOverride ?? null));
  if (planOrLimitChanged) {
    const activeEmployeeCount = await User.countDocuments({
      tenantId: currentTenant._id,
      role: { $ne: "admin" },
      isActive: { $ne: false },
    });
    const effectiveLimit = getEffectiveEmployeeLimit({
      plan: updatedPlan,
      employeeLimitOverride: updatedOverride,
    });
    if (activeEmployeeCount > effectiveLimit) {
      throw new ApiError(
        409,
        `Cannot lower the employee limit below the ${activeEmployeeCount} active employees in this tenant.`,
      );
    }
  }
  const tenant = await Tenant.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: "deleted" } },
    { $set: updates },
    { new: true, runValidators: true },
  ).lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");
  if (
    req.superAdminAuditLogId &&
    (planChanged ||
      (hasOverride &&
        oldOverride !== (tenant.employeeLimitOverride ?? null)))
  ) {
    await SuperAdminAuditLog.updateOne(
      { _id: req.superAdminAuditLogId, who: req.superAdmin._id },
      {
        $set: {
          details: {
            oldPlan,
            newPlan: tenant.plan,
            oldEmployeeLimitOverride: oldOverride,
            newEmployeeLimitOverride: tenant.employeeLimitOverride ?? null,
          },
        },
      },
    );
  }
  tenant.planEmployeeLimit = PLANS[tenant.plan].employeeLimit;
  tenant.effectiveEmployeeLimit = getEffectiveEmployeeLimit(tenant);
  return ApiResponse.send(res, 200, tenant, "Tenant updated");
});

export const updateTenantStatus = asyncHandler(async (req, res) => {
  validateTenantId(req.params.id);
  const tenant = await Tenant.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: "deleted" } },
    { $set: { status: req.body.status } },
    { new: true, runValidators: true },
  ).lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");
  return ApiResponse.send(res, 200, tenant, "Tenant status updated");
});

export const deleteTenant = asyncHandler(async (req, res) => {
  validateTenantId(req.params.id);
  const deletedAt = new Date();
  const tenant = await Tenant.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: "deleted" } },
    {
      $set: {
        status: "deleted",
        deletedAt,
        purgeAfter: new Date(deletedAt.getTime() + retentionPeriodMs),
      },
    },
    { new: true, runValidators: true },
  ).lean();
  if (!tenant) throw new ApiError(404, "Tenant not found or already deleted");
  return ApiResponse.send(
    res,
    200,
    tenant,
    "Tenant soft-deleted; data is retained for 30 days for manual purge",
  );
});

export const getSuperAdminStats = asyncHandler(async (req, res) => {
  const [
    totalTenants,
    activeTenants,
    trialTenants,
    suspendedTenants,
    liveTenants,
  ] = await Promise.all([
    Tenant.countDocuments({ status: { $ne: "deleted" } }),
    Tenant.countDocuments({ status: "active" }),
    Tenant.countDocuments({ status: "trial" }),
    Tenant.countDocuments({ status: "suspended" }),
    Tenant.find({ status: { $ne: "deleted" } }).select("_id").lean(),
  ]);

  const employeeCounts = await getEmployeeCountsByTenant(
    liveTenants.map(({ _id }) => _id),
  );
  const totalEmployees = employeeCounts.reduce(
    (total, { count }) => total + count,
    0,
  );

  return ApiResponse.send(
    res,
    200,
    {
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      totalEmployees,
    },
    "Platform statistics retrieved",
  );
});
