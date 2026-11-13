import { PLANS, planHasFeature } from "../config/plans.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import Tenant from "../models/Tenant.js";
import { checkPlanLimit as checkEmployeeCapacity } from "../utils/tenantLimits.js";

const isReadMethod = (method) => ["GET", "HEAD", "OPTIONS"].includes(method);

const planError = (code, message) => {
  const error = new ApiError(403, message);
  error.code = code;
  return error;
};

const tenantFields =
  "name slug status plan employeeLimitOverride trialEndsAt billing.status billing.currentPeriodEnd billing.suspensionReason";

const downgradeExpiredTrial = async (tenant) => {
  const now = new Date();
  const trialEndsAt = tenant.trialEndsAt
    ? new Date(tenant.trialEndsAt)
    : null;
  if (
    tenant.status !== "trial" ||
    !trialEndsAt ||
    Number.isNaN(trialEndsAt.getTime()) ||
    trialEndsAt > now
  ) {
    return tenant;
  }

  const updatedTenant = await Tenant.findOneAndUpdate(
    {
      _id: tenant._id,
      status: "trial",
      trialEndsAt: { $lte: now },
    },
    {
      $set: {
        status: "active",
        plan: "free",
        employeeLimitOverride: null,
        trialEndsAt: null,
      },
    },
    { new: true, runValidators: true },
  )
    .select(tenantFields)
    .lean();

  if (updatedTenant) return updatedTenant;

  const currentTenant = await Tenant.findById(tenant._id)
    .select(tenantFields)
    .lean();
  if (!currentTenant) throw new ApiError(404, "Tenant not found");
  if (
    currentTenant.status === "trial" &&
    currentTenant.trialEndsAt &&
    new Date(currentTenant.trialEndsAt) <= now
  ) {
    throw new ApiError(503, "Unable to apply the expired trial downgrade");
  }
  return currentTenant;
};

const resolveTenant = async (req, fromCompanySlug) => {
  let tenant = req.tenant;
  if (!tenant) {
    const query = fromCompanySlug
      ? Tenant.findOne({ slug: req.body.companySlug.trim().toLowerCase() })
      : Tenant.findById(req.tenantId);
    tenant =
      query && typeof query.select === "function"
        ? await query.select(tenantFields).lean()
        : await query;
  }

  if (!tenant) {
    throw new ApiError(
      fromCompanySlug ? 400 : 404,
      fromCompanySlug ? "Invalid or unavailable company code" : "Tenant not found",
    );
  }
  tenant = await downgradeExpiredTrial(tenant);
  req.tenant = tenant;
  return tenant;
};

export const getSubscriptionRestriction = (tenant, now = new Date()) => {
  if (tenant.status === "trial") return null;
  if (tenant.plan === "free") return null;

  const billing = tenant.billing || {};
  const paidThrough =
    billing.status === "active" ||
    (billing.status === "cancelled" &&
      billing.currentPeriodEnd &&
      new Date(billing.currentPeriodEnd) > now);
  if (!paidThrough) {
    return "An active subscription is required to make changes. Upgrade or renew your plan; existing data remains available read-only.";
  }
  return null;
};

export const checkPlanLimit = ({
  resolveByCompanySlug = false,
  employeeDelta,
} = {}) =>
  asyncHandler(async (req, res, next) => {
    const tenant = await resolveTenant(req, resolveByCompanySlug);
    if (tenant.status === "suspended") {
      if (tenant.billing?.suspensionReason !== "non-payment") {
        throw new ApiError(403, "This company account is unavailable");
      }
      if (!isReadMethod(req.method)) {
        throw planError(
          "SUBSCRIPTION_EXPIRED",
          "This company account is suspended and read-only.",
        );
      }
    }

    if (!isReadMethod(req.method)) {
      const restriction = getSubscriptionRestriction(tenant);
      if (restriction) {
        throw planError("SUBSCRIPTION_EXPIRED", restriction);
      }
    }

    if (employeeDelta !== undefined) {
      const delta =
        typeof employeeDelta === "function"
          ? employeeDelta(req)
          : employeeDelta;
      await checkEmployeeCapacity(tenant._id, delta);
    }

    next();
  });

export const requirePlanFeature = (feature) =>
  asyncHandler(async (req, res, next) => {
    const tenant = await resolveTenant(req, false);
    if (!PLANS[tenant.plan] || !planHasFeature(tenant.plan, feature)) {
      throw planError(
        "FEATURE_NOT_IN_PLAN",
        `The ${PLANS[tenant.plan]?.label || "current"} plan does not include ${feature}. Upgrade to Pro to access this feature.`,
      );
    }
    next();
  });
