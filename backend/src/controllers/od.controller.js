import { OutdoorDuty } from "../models/OutdoorDuty.js";
import { Attendance } from "../models/Attendance.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Helper to determine attendance tier based on duration
const evaluateAttendanceTier = (hours) => {
  if (hours >= 9) return "present";
  if (hours >= 7) return "short-leave";
  if (hours >= 5) return "half-day";
  return "absent";
};

// Apply for Outdoor Duty with Start & End Time
export const applyOutdoorDuty = asyncHandler(async (req, res) => {
  const { date, startTime, endTime, location, reason } = req.body;

  if (!date || !startTime || !endTime || !reason) {
    throw new ApiError(
      400,
      "Date, start time, end time, and reason are required",
    );
  }

  // Calculate duration from provided timestamps
  const startDateTime = new Date(`${date}T${startTime}:00`);
  const endDateTime = new Date(`${date}T${endTime}:00`);

  if (endDateTime <= startDateTime) {
    throw new ApiError(400, "End time must be greater than start time");
  }

  const diffMs = endDateTime.getTime() - startDateTime.getTime();
  const calculatedHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

  // Check if an application already exists for this date
  const existingOD = await OutdoorDuty.findOne({
    userId: req.user._id,
    date,
  });
  if (existingOD) {
    throw new ApiError(
      400,
      "An Outdoor Duty request has already been filed for this date",
    );
  }

  const newOD = await OutdoorDuty.create({
    userId: req.user._id,
    date,
    startTime,
    endTime,
    hours: calculatedHours,
    location: location?.trim() || "",
    reason: reason.trim(),
  });

  return ApiResponse.send(
    res,
    201,
    newOD,
    "Outdoor Duty request submitted for approval",
  );
});

// Get user's own OD requests
export const getMyODRequestsold = asyncHandler(async (req, res) => {
  const records = await OutdoorDuty.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(30);

  return ApiResponse.send(res, 200, records, "Outdoor duty history retrieved");
});

// Approver view: Managers see their reportees; HR Admin sees all
export const getPendingODRequestsold = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === "manager") {
    const reportees = await User.find({
      reportingManager: req.user._id,
    }).select("_id");
    const reporteeIds = reportees.map((r) => r._id);
    filter = { userId: { $in: reporteeIds } };
  }

  const requests = await OutdoorDuty.find(filter)
    .populate("userId", "name email employeeId role")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 });

  return ApiResponse.send(res, 200, requests, "Pending OD requests retrieved");
});

// Approve or Reject OD Request
export const reviewOutdoorDuty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    throw new ApiError(400, "Invalid status. Must be 'approved' or 'rejected'");
  }

  const od = await OutdoorDuty.findById(id);
  if (!od) {
    throw new ApiError(404, "Outdoor Duty record not found");
  }

  if (od.status !== "pending") {
    throw new ApiError(400, "This request has already been reviewed");
  }

  od.status = status;
  od.reviewedBy = req.user._id;
  if (status === "rejected") {
    od.rejectionReason = rejectionReason?.trim() || "Rejected by approver";
  }

  await od.save();

  // When approved, create or update attendance for that day with precise punch-in/out times
  if (status === "approved") {
    const startTime = od.startTime || "09:30";
    const endTime = od.endTime || "18:30";

    const clockIn = new Date(`${od.date}T${startTime}:00`);
    const clockOut = new Date(`${od.date}T${endTime}:00`);

    const diffMs = clockOut.getTime() - clockIn.getTime();
    const dutyHours = parseFloat(
      Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2),
    );
    const dutyMinutes = Math.round(dutyHours * 60);

    const existingLog = await Attendance.findOne({
      userId: od.userId,
      date: od.date,
    });

    if (existingLog) {
      existingLog.clockIn = existingLog.clockIn || clockIn;
      existingLog.clockOut = clockOut;
      existingLog.activeMinutes =
        (existingLog.activeMinutes || 0) + dutyMinutes;
      existingLog.totalHours = parseFloat(
        (existingLog.activeMinutes / 60).toFixed(2),
      );
      existingLog.status = evaluateAttendanceTier(existingLog.totalHours);
      existingLog.ipAddress = existingLog.ipAddress || "OD-DUTY-APPROVED";
      await existingLog.save();
    } else {
      await Attendance.create({
        userId: od.userId,
        date: od.date,
        clockIn,
        clockOut,
        totalHours: dutyHours,
        activeMinutes: dutyMinutes,
        status: evaluateAttendanceTier(dutyHours),
        ipAddress: "OD-DUTY-APPROVED",
      });
    }
  }

  return ApiResponse.send(res, 200, od, `Outdoor Duty request ${status}`);
});

// Approver view: Managers see their reportees; HR Admin sees all
export const getPendingODRequests = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 5);
  const skip = (page - 1) * limit;

  let filter = {};

  if (req.user.role === "manager") {
    const reportees = await User.find({
      reportingManager: req.user._id,
    }).select("_id");
    const reporteeIds = reportees.map((r) => r._id);
    filter = { userId: { $in: reporteeIds } };
  }

  const [records, total] = await Promise.all([
    OutdoorDuty.find(filter)
      .populate("userId", "name email employeeId role")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    OutdoorDuty.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Pending OD requests retrieved",
  );
});

// Get user's own OD requests
export const getMyODRequests = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 5);
  const skip = (page - 1) * limit;

  const filter = { userId: req.user._id };

  const [records, total] = await Promise.all([
    OutdoorDuty.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    OutdoorDuty.countDocuments(filter),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Outdoor duty history retrieved",
  );
});
