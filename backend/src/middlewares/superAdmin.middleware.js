import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import SuperAdmin from "../models/SuperAdmin.js";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog.js";
import { ApiError } from "../utils/ApiError.js";
import { ENV } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authenticateSuper = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) {
    throw new ApiError(401, "Unauthorized: Super Admin access token required");
  }
  if (!ENV.SUPER_JWT_SECRET) {
    throw new ApiError(500, "SUPER_JWT_SECRET is not configured");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, ENV.SUPER_JWT_SECRET);
  } catch {
    throw new ApiError(401, "Unauthorized: Super Admin token is invalid or expired");
  }
  if (decoded.type !== "super" || !decoded.id) {
    throw new ApiError(401, "Unauthorized: Super Admin token required");
  }

  const superAdmin = await SuperAdmin.findById(decoded.id).lean();
  if (!superAdmin) {
    throw new ApiError(401, "Super Admin associated with this token no longer exists");
  }

  req.superAdmin = superAdmin;
  next();
});

export const auditSuperAction = asyncHandler(async (req, res, next) => {
  const tenantIdMatch = req.path.match(
    /^\/tenants\/([a-f\d]{24})(?:\/|$)/i,
  );
  const tenantId =
    tenantIdMatch && mongoose.isValidObjectId(tenantIdMatch[1])
      ? tenantIdMatch[1]
      : null;
  const auditLog = await SuperAdminAuditLog.create({
    who: req.superAdmin._id,
    action: `${req.method} ${req.baseUrl}${req.path}`,
    tenantId,
  });
  req.superAdminAuditLogId = auditLog._id;
  next();
});
