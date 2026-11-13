import crypto from "crypto";
import Tenant from "../models/Tenant.js";
import { User } from "../models/User.js";
import { getPlanOptions } from "../config/plans.js";
import { isValidTenantSlug } from "../config/slugPolicy.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import TenantRequest from "../models/TenantRequest.js";

const hashVerificationToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getPublicPlans = asyncHandler(async (_req, res) =>
  ApiResponse.send(res, 200, { plans: getPlanOptions() }, "Plans retrieved"),
);

export const checkSlugAvailability = asyncHandler(async (req, res) => {
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
  const exists = Boolean(tenantExists || pendingRequestExists);
  return ApiResponse.send(
    res,
    200,
    { available: !exists, reason: exists ? "taken" : null },
    exists ? "Company code is already in use" : "Company code is available",
  );
});

export const signupTenant = asyncHandler(async (_req, _res) => {
  throw new ApiError(
    410,
    "Direct workspace signup is no longer available. Submit a tenant request instead.",
  );
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({
    slug: req.body.companySlug,
  }).select("_id");
  if (!tenant) throw new ApiError(400, "Invalid or expired verification link");

  const user = await User.findOne({
    tenantId: tenant._id,
    emailVerificationToken: hashVerificationToken(req.body.token),
    emailVerificationExpires: { $gt: new Date() },
    emailVerified: false,
  }).select("+emailVerificationToken +emailVerificationExpires");
  if (!user) throw new ApiError(400, "Invalid or expired verification link");

  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpires = null;
  await user.save({ validateBeforeSave: false });

  return ApiResponse.send(
    res,
    200,
    { emailVerified: true },
    "Email verified successfully",
  );
});
