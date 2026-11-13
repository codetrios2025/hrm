import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResetPasswordEmail } from "../utils/email.js";
import { ENV } from "../config/env.js";
import { ROLES } from "../constants/roles.js";
import crypto from "crypto"; // Import crypto for generating secure tokens
import { PLANS } from "../config/plans.js";

const generateToken = (id, role, tenantId) => {
  return jwt.sign({ id, role, tenantId }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN,
  });
};

export const register = asyncHandler(async (req, res) => {
  const { companySlug, name, email, password, reportingManager } = req.body;
  const tenant = await Tenant.findOne({
    slug: companySlug.trim().toLowerCase(),
  });

  if (!tenant || ["suspended", "deleted"].includes(tenant.status)) {
    throw new ApiError(400, "Invalid or unavailable company code");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({
    tenantId: tenant._id,
    email: normalizedEmail,
  });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists");
  }

  if (reportingManager) {
    const manager = await User.findOne({
      _id: reportingManager,
      tenantId: tenant._id,
    });
    if (!manager) {
      throw new ApiError(400, "Reporting manager is not in this company");
    }
  }

  const user = await User.create({
    tenantId: tenant._id,
    name,
    email: normalizedEmail,
    password,
    role: ROLES.EMPLOYEE,
    reportingManager,
  });

  return ApiResponse.send(
    res,
    201,
    {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
    "User registered successfully",
  );
});

export const login = asyncHandler(async (req, res) => {
  const { companySlug, email, password } = req.body;
  const tenant = await Tenant.findOne({
    slug: companySlug.trim().toLowerCase(),
  });
  if (!tenant) {
    throw new ApiError(401, "Invalid company code or credentials");
  }
  if (
    tenant.status === "suspended" &&
    tenant.billing?.suspensionReason !== "non-payment"
  ) {
    throw new ApiError(403, "This company account is suspended");
  }
  if (tenant.status === "deleted") {
    throw new ApiError(403, "This company account is unavailable");
  }
  const user = await User.findOne({
    tenantId: tenant._id,
    email: email.trim().toLowerCase(),
  }).select("+password");
  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid company code or credentials");
  }

  // Block deactivated users
  if (user.isActive === false) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Please contact your HR administrator.",
    );
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id, user.role, tenant._id);

  return ApiResponse.send(
    res,
    200,
    {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        leaveBalance: user.leaveBalance,
        tenantId: tenant._id,
        emailVerified: user.emailVerified !== false,
        onboardingCompleted: tenant.onboarding?.completed ?? true,
        onboardingStep: tenant.onboarding?.step ?? 5,
        plan: tenant.plan,
        planFeatures: PLANS[tenant.plan]?.modules || [],
        tenantStatus: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
      },
    },
    "Login successful",
  );
});

export const loginold = login;

export const getMe = asyncHandler(async (req, res) => {
  const [user, tenant] = await Promise.all([
    User.findOne({
      _id: req.user._id,
      tenantId: req.tenantId,
    }).select("-password"),
    Tenant.findById(req.tenantId)
      .select("onboarding plan status trialEndsAt")
      .lean(),
  ]);
  if (!user || !tenant) {
    throw new ApiError(404, "Account or tenant could not be found");
  }
  const profile = user.toObject ? user.toObject() : { ...user };
  profile.emailVerified = user.emailVerified !== false;
  profile.onboardingCompleted = tenant.onboarding?.completed ?? true;
  profile.onboardingStep = tenant.onboarding?.step ?? 5;
  profile.plan = tenant.plan;
  profile.planFeatures = PLANS[tenant.plan]?.modules || [];
  profile.tenantStatus = tenant.status;
  profile.trialEndsAt = tenant.trialEndsAt;
  return ApiResponse.send(res, 200, profile, "Profile details retrieved");
});

// Forgot Password -> Sends email with reset link
export const forgotPassword = asyncHandler(async (req, res) => {
  const { companySlug, email } = req.body;
  const tenant = await Tenant.findOne({
    slug: companySlug.trim().toLowerCase(),
  });
  const user = tenant && !["suspended", "deleted"].includes(tenant.status)
    ? await User.findOne({
        tenantId: tenant._id,
        email: email.trim().toLowerCase(),
      })
    : null;
  if (!user) {
    // Avoid user enumeration: respond with success even if email not found
    return ApiResponse.send(
      res,
      200,
      null,
      "If this email exists, a password reset link has been dispatched.",
    );
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    await sendResetPasswordEmail({
      name: user.name,
      email: user.email,
      resetToken,
      companySlug: tenant.slug,
    });
    return ApiResponse.send(
      res,
      200,
      null,
      "Password reset link sent to your email.",
    );
  } catch (err) {
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(500, "Error sending email. Please try again later.");
  }
});

export const forgotPasswordnew = asyncHandler(async (req, res) => {
  const { companySlug, email } = req.body;

  if (!companySlug || !email) {
    throw new ApiError(400, "Company code and email are required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const tenant = await Tenant.findOne({
    slug: companySlug.trim().toLowerCase(),
  });

  const user =
    tenant && !["suspended", "deleted"].includes(tenant.status)
      ? await User.findOne({
          tenantId: tenant._id,
          email: normalizedEmail,
        })
      : null;

  /**
   * Avoid user enumeration.
   *
   * We return the same success response whether
   * the email exists or not.
   */
  if (!user) {
    return ApiResponse.send(
      res,
      200,
      null,
      "If this email exists, a password reset link has been dispatched.",
    );
  }

  /**
   * =======================================================
   * Generate secure random token
   * =======================================================
   *
   * randomBytes is imported from:
   *
   * import crypto from "node:crypto";
   *
   * and called as:
   *
   * crypto.randomBytes(...)
   */
  const resetToken = crypto.randomBytes(32).toString("hex");

  /**
   * Hash token before saving to database.
   */
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  /**
   * Token expires after 30 minutes.
   *
   * You can change this to 15, 60 etc.
   */
  const resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = resetTokenExpires;

  await user.save({
    validateBeforeSave: false,
  });

  /**
   * Send RAW token to email.
   *
   * Do NOT send hashedToken.
   */
  try {
    await sendResetPasswordEmail({
      name: user.name,
      email: user.email,
      resetToken,
      companySlug: tenant.slug,
    });

    return ApiResponse.send(
      res,
      200,
      null,
      "Password reset link sent to your email.",
    );
  } catch (error) {
    /**
     * If email sending fails,
     * remove the reset token from database.
     */
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save({
      validateBeforeSave: false,
    });

    console.error("Forgot password email error:", error);

    throw new ApiError(500, "Error sending email. Please try again later.");
  }
});

// Reset Password with Token
export const resetPassword = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({
    slug: req.body.companySlug.trim().toLowerCase(),
  });
  if (!tenant || ["suspended", "deleted"].includes(tenant.status)) {
    throw new ApiError(400, "Invalid or unavailable company code");
  }

  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    tenantId: tenant._id,
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, "Password reset token is invalid or has expired.");
  }

  user.password = req.body.password;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();

  return ApiResponse.send(
    res,
    200,
    null,
    "Password reset successful. You can now login.",
  );
});

// Change Password for logged in user
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findOne({
    _id: req.user._id,
    tenantId: req.tenantId,
  }).select("+password");
  if (!(await user.isPasswordCorrect(currentPassword))) {
    throw new ApiError(400, "Incorrect current password");
  }

  user.password = newPassword;
  await user.save();

  return ApiResponse.send(res, 200, null, "Password changed successfully");
});
