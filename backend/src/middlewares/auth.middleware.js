import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { ENV } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authenticateold = asyncHandler(async (req, res, next) => {
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

  const currentUser = await User.findById(decoded.id).lean();
  if (!currentUser) {
    throw new ApiError(401, "User associated with this token no longer exists");
  }

  req.user = currentUser;
  next();
});

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

  const currentUser = await User.findById(decoded.id).lean();
  if (!currentUser) {
    throw new ApiError(401, "User associated with this token no longer exists");
  }

  // Reject active tokens of deactivated users
  if (currentUser.isActive === false) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Access revoked.",
    );
  }

  req.user = currentUser;
  next();
});

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
