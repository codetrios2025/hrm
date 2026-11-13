import Tenant from "../models/Tenant.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getOnboarding = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.tenantId)
    .select("name companyProfile leavePolicy onboarding")
    .lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");
  return ApiResponse.send(res, 200, tenant, "Onboarding data retrieved");
});

export const updateOnboarding = asyncHandler(async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.companyProfile) {
    updates.companyProfile = req.body.companyProfile;
  }
  if (req.body.leavePolicy) updates.leavePolicy = req.body.leavePolicy;
  if (req.body.step !== undefined) updates["onboarding.step"] = req.body.step;
  if (req.body.completed) {
    updates["onboarding.completed"] = true;
    updates["onboarding.step"] = 5;
    updates["onboarding.completedAt"] = new Date();
  }

  const tenant = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $set: updates },
    { new: true, runValidators: true },
  )
    .select("name companyProfile leavePolicy onboarding")
    .lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");

  return ApiResponse.send(res, 200, tenant, "Onboarding progress saved");
});
