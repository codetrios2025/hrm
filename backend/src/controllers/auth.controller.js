import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResetPasswordEmail } from "../utils/email.js";
import { ENV } from "../config/env.js";
import crypto from "crypto"; // Import crypto for generating secure tokens

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN,
  });
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, reportingManager } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
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
    },
    "User registered successfully",
  );
});

export const loginold = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = generateToken(user._id, user.role);

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
        leaveBalance: user.leaveBalance,
      },
    },
    "Login successful",
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Block deactivated users
  if (user.isActive === false) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Please contact your HR administrator.",
    );
  }

  const token = generateToken(user._id, user.role);

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
      },
    },
    "Login successful",
  );
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  return ApiResponse.send(res, 200, user, "Profile details retrieved");
});

// Forgot Password -> Sends email with reset link
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
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
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
  });

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
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
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

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.isPasswordCorrect(currentPassword))) {
    throw new ApiError(400, "Incorrect current password");
  }

  user.password = newPassword;
  await user.save();

  return ApiResponse.send(res, 200, null, "Password changed successfully");
});
