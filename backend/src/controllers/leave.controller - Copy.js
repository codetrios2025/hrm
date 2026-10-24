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

export const applyLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new ApiError(400, "Start date cannot be after end date");
  }

  const daysCount = getDaysDifference(startDate, endDate);

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Check current balance
  const currentBalance = user.leaveBalance?.[leaveType] ?? 0;
  if (currentBalance < daysCount) {
    throw new ApiError(
      400,
      `Insufficient leave balance. You have only ${currentBalance} day(s) of ${leaveType} leave available, but applied for ${daysCount} day(s).`,
    );
  }

  // Check for date clashes with pending or approved leaves
  const overlapping = await Leave.findOne({
    userId: user._id,
    status: { $in: ["pending", "approved"] },
    $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
  });

  if (overlapping) {
    throw new ApiError(
      400,
      "You already have an active/pending leave covering these dates",
    );
  }

  // 1. Deduct immediately from employee's balance upfront
  user.leaveBalance[leaveType] = currentBalance - daysCount;
  await user.save();

  // 2. Create the pending leave application
  const leave = await Leave.create({
    userId: user._id,
    leaveType,
    startDate: start,
    endDate: end,
    daysCount,
    reason,
    status: "pending",
  });

  return ApiResponse.send(
    res,
    201,
    {
      leave,
      remainingBalance: user.leaveBalance[leaveType],
    },
    `Leave applied successfully. ${daysCount} day(s) deducted. Remaining balance: ${user.leaveBalance[leaveType]}`,
  );
});

// 2. REVIEW LEAVE (Manager/Admin): Refund balance if REJECTED
export const reviewLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body; // 'approved' | 'rejected'

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

  // If rejected, refund the deducted days back to the employee's balance
  if (status === "rejected") {
    applicant.leaveBalance[leave.leaveType] =
      (applicant.leaveBalance[leave.leaveType] ?? 0) + leave.daysCount;
    await applicant.save();

    leave.rejectionReason = rejectionReason?.trim() || "Rejected by approver";
  }

  // Update status & reviewer
  leave.status = status;
  leave.reviewedBy = req.user._id;
  await leave.save();

  return ApiResponse.send(
    res,
    200,
    leave,
    status === "rejected"
      ? `Leave rejected. ${leave.daysCount} day(s) refunded to employee's ${leave.leaveType} balance.`
      : `Leave approved successfully.`,
  );
});

// 3. CANCEL PENDING LEAVE (Employee self-service): Refund deducted days
export const cancelLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const leave = await Leave.findOne({ _id: id, userId: req.user._id });
  if (!leave) {
    throw new ApiError(404, "Leave record not found");
  }

  if (leave.status !== "pending") {
    throw new ApiError(400, "Only pending leave applications can be cancelled");
  }

  // Refund the deducted days
  const user = await User.findById(req.user._id);
  user.leaveBalance[leave.leaveType] =
    (user.leaveBalance[leave.leaveType] ?? 0) + leave.daysCount;
  await user.save();

  leave.status = "cancelled";
  await leave.save();

  return ApiResponse.send(
    res,
    200,
    {
      leave,
      refundedDays: leave.daysCount,
      newBalance: user.leaveBalance[leave.leaveType],
    },
    `Leave cancelled. ${leave.daysCount} day(s) refunded to your ${leave.leaveType} balance.`,
  );
});

export const applyLeaveold = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  const start = new Date(startDate);
  const end = new Date(endDate);

  const diffTime = Math.abs(end - start);
  const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const user = await User.findById(req.user._id);
  if (user.leaveBalance[leaveType] < daysCount) {
    throw new ApiError(
      400,
      `Insufficient ${leaveType} leave balance. Available: ${user.leaveBalance[leaveType]}`,
    );
  }

  // Check overlapping active requests
  const overlap = await Leave.findOne({
    userId: req.user._id,
    status: { $in: ["pending", "approved"] },
    $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
  });

  if (overlap) {
    throw new ApiError(
      400,
      "A pending or approved leave request already exists in this date range",
    );
  }

  const leave = await Leave.create({
    userId: req.user._id,
    leaveType,
    startDate: start,
    endDate: end,
    daysCount,
    reason,
  });

  return ApiResponse.send(
    res,
    201,
    leave,
    "Leave application submitted successfully",
  );
});

export const getMyLeavesold = asyncHandler(async (req, res) => {
  const leaves = await Leave.find({ userId: req.user._id }).sort({
    createdAt: -1,
  });
  return ApiResponse.send(
    res,
    200,
    leaves,
    "Personal leave requests retrieved",
  );
});

export const getTeamLeavesold = asyncHandler(async (req, res) => {
  const leaves = await Leave.find()
    .populate("userId", "name email role")
    .sort({ createdAt: -1 });
  return ApiResponse.send(
    res,
    200,
    leaves,
    "All pending team requests retrieved",
  );
});

// Employee personal leaves with pagination
export const getMyLeaves = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 5);
  const skip = (page - 1) * limit;

  const [leaves, total] = await Promise.all([
    Leave.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Leave.countDocuments({ userId: req.user._id }),
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

// Manager/Admin team leaves with pagination
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

export const reviewLeaveold = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  // Use a Replica Set transaction to guarantee atomicity when updating balance & status
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const leave = await Leave.findById(id).session(session);
    if (!leave) {
      throw new ApiError(404, "Leave request not found");
    }
    if (leave.status !== "pending") {
      throw new ApiError(
        400,
        `Cannot process a leave that is already ${leave.status}`,
      );
    }

    if (status === "approved") {
      const user = await User.findById(leave.userId).session(session);
      if (user.leaveBalance[leave.leaveType] < leave.daysCount) {
        throw new ApiError(400, "User has insufficient balance for approval");
      }

      user.leaveBalance[leave.leaveType] -= leave.daysCount;
      await user.save({ session });
    }

    leave.status = status;
    leave.reviewedBy = req.user._id;
    if (rejectionReason) leave.rejectionReason = rejectionReason;

    await leave.save({ session });
    await session.commitTransaction();

    return ApiResponse.send(
      res,
      200,
      leave,
      `Leave request has been marked as ${status}`,
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const reviewLeave2 = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  const leave = await Leave.findById(id);
  if (!leave) {
    throw new ApiError(404, "Leave request not found");
  }
  if (leave.status !== "pending") {
    throw new ApiError(
      400,
      `Cannot process a leave that is already ${leave.status}`,
    );
  }

  if (status === "approved") {
    const user = await User.findById(leave.userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    if (user.leaveBalance[leave.leaveType] < leave.daysCount) {
      throw new ApiError(400, "User has insufficient balance for approval");
    }

    // Deduct leave balance atomically
    await User.findByIdAndUpdate(leave.userId, {
      $inc: { [`leaveBalance.${leave.leaveType}`]: -leave.daysCount },
    });
  }

  leave.status = status;
  leave.reviewedBy = req.user._id;
  if (status === "rejected") {
    leave.rejectionReason = rejectionReason?.trim() || "Rejected by approver";
  }

  await leave.save();

  return ApiResponse.send(
    res,
    200,
    leave,
    `Leave request has been marked as ${status}`,
  );
});
