import { User } from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { PLANS } from "../config/plans.js";
import { ApiError } from "./ApiError.js";

export const getEffectiveEmployeeLimit = (tenant) => {
  const planLimit = PLANS[tenant.plan]?.employeeLimit;
  if (!planLimit) {
    throw new Error(`Employee limit is not configured for plan "${tenant.plan}"`);
  }
  return tenant.employeeLimitOverride ?? planLimit;
};

export const checkPlanLimit = async (tenantId, additionalEmployees = 1) => {
  if (additionalEmployees <= 0) return;

  const tenant = await Tenant.findById(tenantId)
    .select("plan employeeLimitOverride")
    .lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");

  const [activeEmployeeCount, effectiveLimit] = await Promise.all([
    User.countDocuments({
      tenantId,
      role: { $ne: "admin" },
      isActive: { $ne: false },
    }),
    Promise.resolve(getEffectiveEmployeeLimit(tenant)),
  ]);
  if (activeEmployeeCount + additionalEmployees > effectiveLimit) {
    const error = new ApiError(
      403,
      `The ${tenant.plan} plan allows up to ${effectiveLimit} employees. Upgrade your plan to add more employees.`,
    );
    error.code = "PLAN_LIMIT_REACHED";
    throw error;
  }
};
