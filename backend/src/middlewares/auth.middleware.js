import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { ApiError } from "../utils/ApiError.js";
import { ENV } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authenticate = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    throw new ApiError(401, "Unauthorized: Access token missing");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, ENV.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, "Unauthorized: Token is invalid or expired");
  }
  if (decoded.type === "super" || !decoded.id || !decoded.tenantId) {
    throw new ApiError(401, "Unauthorized: Tenant access token required");
  }

  const currentUser = await User.findById(decoded.id)
    .where("tenantId", decoded.tenantId)
    .lean();
  if (!currentUser) {
    throw new ApiError(401, "User associated with this token no longer exists");
  }
  if (
    !decoded.tenantId ||
    !currentUser.tenantId ||
    String(currentUser.tenantId) !== String(decoded.tenantId)
  ) {
    throw new ApiError(401, "Unauthorized: Tenant context is invalid");
  }

  const tenant = await Tenant.findById(decoded.tenantId)
    .select(
      "status plan employeeLimitOverride trialEndsAt billing.status billing.currentPeriodEnd billing.suspensionReason",
    )
    .lean();
  if (
    !tenant ||
    tenant.status === "deleted" ||
    (tenant.status === "suspended" &&
      tenant.billing?.suspensionReason !== "non-payment")
  ) {
    throw new ApiError(403, "This company account is unavailable");
  }

  // Reject active tokens of deactivated users
  if (currentUser.isActive === false) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Access revoked.",
    );
  }

  req.user = currentUser;
  req.tenantId = currentUser.tenantId;
  req.tenant = tenant;
  if (currentUser.mustChangePassword) {
    const path = req.originalUrl.split("?")[0];
    const isAllowed =
      (req.method === "GET" && path === "/api/auth/me") ||
      (req.method === "PATCH" && path === "/api/auth/change-password");
    if (!isAllowed) {
      const error = new ApiError(
        403,
        "Change your temporary password before continuing",
      );
      error.code = "PASSWORD_CHANGE_REQUIRED";
      throw error;
    }
  }
  next();
});

export const authenticateold = authenticate;

export const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          "Forbidden: You do not have permission for this resource",
        ),
      );
    }
    next();
  };
