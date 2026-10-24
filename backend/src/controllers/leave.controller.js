import mongoose from "mongoose";
import { Leave } from "../models/Leave.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Helper to count inclusive days between dates
const getDaysDifference = (start, end) => {
  const d1 = new Date(start);
  const d2 = new Date(end);

  const diffTime = Math.abs(d2 - d1);

  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// ============================================================
// 1. APPLY LEAVE
// ============================================================

export const applyLeaveold2oct = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;

  const start = new Date(startDate);
  const end = new Date(endDate);

  // Validate dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ApiError(400, "Invalid start date or end date");
  }

  if (start > end) {
    throw new ApiError(400, "Start date cannot be after end date");
  }

  const daysCount = getDaysDifference(startDate, endDate);

  // Find user
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // ----------------------------------------------------------
  // Check current leave balance
  // LWP does not have a quota check
  // ----------------------------------------------------------

  const currentBalance = user.leaveBalance?.[leaveType] ?? 0;

  if (leaveType !== "lwp" && currentBalance < daysCount) {
    throw new ApiError(
      400,
      `Insufficient leave balance. You have only ${currentBalance} day(s) of ${leaveType} leave available, but applied for ${daysCount} day(s).`,
    );
  }

  // ----------------------------------------------------------
  // Check overlapping leaves
  // ----------------------------------------------------------

  const overlapping = await Leave.findOne({
    userId: user._id,
    status: { $in: ["pending", "approved"] },

    $or: [
      {
        startDate: { $lte: end },
        endDate: { $gte: start },
      },
    ],
  });

  if (overlapping) {
    throw new ApiError(
      400,
      "You already have an active/pending leave covering these dates",
    );
  }

  // ----------------------------------------------------------
  // Adjust employee leave balance
  // ----------------------------------------------------------

  if (leaveType === "lwp") {
    // LWP is tracked as total days taken
    user.leaveBalance.lwp = (user.leaveBalance.lwp || 0) + daysCount;
  } else {
    // Deduct available balance
    user.leaveBalance[leaveType] = currentBalance - daysCount;
  }

  await user.save();

  // ----------------------------------------------------------
  // Create leave application
  // ----------------------------------------------------------

  const leave = await Leave.create({
    userId: user._id,
    leaveType,
    startDate: start,
    endDate: end,
    daysCount,
    reason,
    status: "pending",
  });

  // ----------------------------------------------------------
  // Success message
  // ----------------------------------------------------------

  const successMessage =
    leaveType === "lwp"
      ? `Leave applied successfully. Total LWP count is now ${user.leaveBalance.lwp} day(s).`
      : `Leave applied successfully. ${daysCount} day(s) deducted. Remaining balance: ${user.leaveBalance[leaveType]}`;

  return ApiResponse.send(
    res,
    201,
    {
      leave,
      remainingBalance: user.leaveBalance[leaveType],
    },
    successMessage,
  );
});

export const applyLeave7oct = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;

  // ----------------------------------------------------------
  // Basic validation
  // ----------------------------------------------------------

  if (!leaveType) {
    throw new ApiError(400, "Leave type is required");
  }

  if (!startDate || !endDate) {
    throw new ApiError(400, "Start date and end date are required");
  }

  let prescription = null;

  if (req.file) {
    prescription = {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
    };
  }

  // ----------------------------------------------------------
  // Sick Leave Prescription Validation
  // ----------------------------------------------------------

  // req.file will be populated by multer
  if (leaveType === "sick" && !prescription) {
    throw new ApiError(
      400,
      "Medical prescription is mandatory for Sick Leave.",
    );
  }

  // ----------------------------------------------------------
  // Validate dates
  // ----------------------------------------------------------

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ApiError(400, "Invalid start date or end date");
  }

  if (start > end) {
    throw new ApiError(400, "Start date cannot be after end date");
  }

  const daysCount = getDaysDifference(startDate, endDate);

  // ----------------------------------------------------------
  // Find user
  // ----------------------------------------------------------

  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // ----------------------------------------------------------
  // Check current leave balance
  // LWP does not have a quota check
  // ----------------------------------------------------------

  const currentBalance = user.leaveBalance?.[leaveType] ?? 0;

  if (leaveType !== "lwp" && currentBalance < daysCount) {
    throw new ApiError(
      400,
      `Insufficient leave balance. You have only ${currentBalance} day(s) of ${leaveType} leave available, but applied for ${daysCount} day(s).`,
    );
  }

  // ----------------------------------------------------------
  // Check overlapping leaves
  // ----------------------------------------------------------

  const overlapping = await Leave.findOne({
    userId: user._id,
    status: { $in: ["pending", "approved"] },
    $or: [
      {
        startDate: { $lte: end },
        endDate: { $gte: start },
      },
    ],
  });

  if (overlapping) {
    throw new ApiError(
      400,
      "You already have an active/pending leave covering these dates",
    );
  }

  // ----------------------------------------------------------
  // Prescription file information
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // Adjust employee leave balance
  // ----------------------------------------------------------

  if (leaveType === "lwp") {
    user.leaveBalance.lwp = (user.leaveBalance.lwp || 0) + daysCount;
  } else {
    user.leaveBalance[leaveType] = currentBalance - daysCount;
  }

  await user.save();

  // ----------------------------------------------------------
  // Create leave application
  // ----------------------------------------------------------

  const leave = await Leave.create({
    userId: user._id,
    leaveType,
    startDate: start,
    endDate: end,
    daysCount,
    reason,
    status: "pending",

    // Store prescription only when uploaded
    prescription,
  });

  // ----------------------------------------------------------
  // Success message
  // ----------------------------------------------------------

  const successMessage =
    leaveType === "lwp"
      ? `Leave applied successfully. Total LWP count is now ${user.leaveBalance.lwp} day(s).`
      : `Leave applied successfully. ${daysCount} day(s) deducted. Remaining balance: ${user.leaveBalance[leaveType]}`;

  return ApiResponse.send(
    res,
    201,
    {
      leave,
      remainingBalance: user.leaveBalance[leaveType],
    },
    successMessage,
  );
});

export const applyLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason, isHalfDay, halfDaySession } =
    req.body;

  if (!leaveType || !startDate || !reason) {
    throw new ApiError(400, "All required leave fields must be filled");
  }

  const start = new Date(startDate);
  let end = endDate ? new Date(endDate) : start;
  let daysCount = 0;

  // Handle both boolean and string "true" from multipart/form-data
  const isHalf = isHalfDay === true || isHalfDay === "true";

  if (isHalf) {
    daysCount = 0.5; // Explicitly set to 0.5
    end = start;
    if (!halfDaySession || !["first", "second"].includes(halfDaySession)) {
      throw new ApiError(400, "Please specify a valid half-day session");
    }
  } else {
    if (end < start) {
      throw new ApiError(400, "End date cannot be earlier than start date");
    }
    const diffTime = Math.abs(end.getTime() - start.getTime());
    daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  // Check user balance and deduct atomically
  const user = await User.findById(req.user._id);
  if (leaveType !== "lwp") {
    const currentBalance = user.leaveBalance?.[leaveType] || 0;
    if (currentBalance < daysCount) {
      throw new ApiError(
        400,
        `Insufficient leave balance. You have ${currentBalance} day(s) remaining for ${leaveType.toUpperCase()}`,
      );
    }

    // Atomically deduct 0.5 (or N days)
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { [`leaveBalance.${leaveType}`]: -daysCount },
    });
  }

  let prescriptionUrl = "";
  if (req.file) {
    prescriptionUrl = `/uploads/${req.file.filename}`;
  }

  const newLeave = await Leave.create({
    userId: req.user._id,
    leaveType,
    startDate: start,
    endDate: end,
    daysCount, // Will now successfully save as 0.5
    reason,
    isHalfDay: isHalf,
    halfDaySession: isHalf ? halfDaySession : null,
    prescriptionUrl,
    status: "pending",
  });

  return ApiResponse.send(
    res,
    201,
    newLeave,
    "Leave application submitted successfully",
  );
});

// ============================================================
// 2. REVIEW LEAVE
// Manager/Admin
// Refund balance if rejected
// ============================================================

export const reviewLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  // Validate status
  if (!["approved", "rejected"].includes(status)) {
    throw new ApiError(
      400,
      "Invalid status. Status must be approved or rejected.",
    );
  }

  const leave = await Leave.findById(id);

  if (!leave) {
    throw new ApiError(404, "Leave application not found");
  }

  if (leave.status !== "pending") {
    throw new ApiError(
      400,
      `This leave application has already been ${leave.status}`,
    );
  }

  const applicant = await User.findById(leave.userId);

  if (!applicant) {
    throw new ApiError(404, "Applicant user record not found");
  }

  // ----------------------------------------------------------
  // If rejected, refund the deducted days
  // ----------------------------------------------------------

  if (status === "rejected") {
    if (leave.leaveType === "lwp") {
      // Reverse LWP count
      applicant.leaveBalance.lwp = Math.max(
        0,
        (applicant.leaveBalance.lwp || 0) - leave.daysCount,
      );
    } else {
      // Refund normal leave quota
      applicant.leaveBalance[leave.leaveType] =
        (applicant.leaveBalance[leave.leaveType] ?? 0) + leave.daysCount;
    }

    await applicant.save();

    leave.rejectionReason = rejectionReason?.trim() || "Rejected by approver";
  }

  // ----------------------------------------------------------
  // Update leave status
  // ----------------------------------------------------------

  leave.status = status;
  leave.reviewedBy = req.user._id;

  await leave.save();

  // ----------------------------------------------------------
  // Response message
  // ----------------------------------------------------------

  const msg =
    status === "rejected"
      ? leave.leaveType === "lwp"
        ? `Leave rejected. ${leave.daysCount} day(s) removed from LWP count.`
        : `Leave rejected. ${leave.daysCount} day(s) refunded to employee's ${leave.leaveType} balance.`
      : "Leave approved successfully.";

  return ApiResponse.send(res, 200, leave, msg);
});

// ============================================================
// 3. CANCEL PENDING LEAVE
// Employee self-service
// Refund deducted days
// ============================================================

export const cancelLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const leave = await Leave.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!leave) {
    throw new ApiError(404, "Leave record not found");
  }

  if (leave.status !== "pending") {
    throw new ApiError(400, "Only pending leave applications can be cancelled");
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // ----------------------------------------------------------
  // Refund leave balance
  // ----------------------------------------------------------

  if (leave.leaveType === "lwp") {
    user.leaveBalance.lwp = Math.max(
      0,
      (user.leaveBalance.lwp || 0) - leave.daysCount,
    );
  } else {
    user.leaveBalance[leave.leaveType] =
      (user.leaveBalance[leave.leaveType] ?? 0) + leave.daysCount;
  }

  await user.save();

  // ----------------------------------------------------------
  // Update leave status
  // ----------------------------------------------------------

  leave.status = "cancelled";

  await leave.save();

  // ----------------------------------------------------------
  // Response message
  // ----------------------------------------------------------

  const msg =
    leave.leaveType === "lwp"
      ? `Leave cancelled. ${leave.daysCount} day(s) removed from your LWP count.`
      : `Leave cancelled. ${leave.daysCount} day(s) refunded to your ${leave.leaveType} balance.`;

  return ApiResponse.send(
    res,
    200,
    {
      leave,
      refundedDays: leave.daysCount,
      newBalance: user.leaveBalance[leave.leaveType],
    },
    msg,
  );
});

// ============================================================
// 4. GET MY LEAVES
// Employee personal leaves with pagination
// ============================================================

export const getMyLeaves = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const limit = Math.max(1, parseInt(req.query.limit) || 5);

  const skip = (page - 1) * limit;

  const [leaves, total] = await Promise.all([
    Leave.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Leave.countDocuments({
      userId: req.user._id,
    }),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      leaves,

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Personal leave requests retrieved",
  );
});

// ============================================================
// 5. GET TEAM LEAVES
// Manager/Admin team leaves with pagination
// ============================================================

export const getTeamLeaves = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const limit = Math.max(1, parseInt(req.query.limit) || 5);

  const skip = (page - 1) * limit;

  const [leaves, total] = await Promise.all([
    Leave.find()
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Leave.countDocuments(),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      leaves,

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "All team requests retrieved",
  );
});
