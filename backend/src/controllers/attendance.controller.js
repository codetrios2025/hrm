import { Attendance } from "../models/Attendance.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/User.js";

// Helper to get local date formatted as YYYY-MM-DD
const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
// Helper to get formatted current date string YYYY-MM-DD
const getTodayDateString = () => {
  return new Date().toISOString().split("T")[0];
};

export const clockIn = asyncHandler(async (req, res) => {
  const today = getLocalDateString();
  const clientIp =
    req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  const existingLog = await Attendance.findOne({
    userId: req.user._id,
    date: today,
  });
  if (existingLog) {
    throw new ApiError(400, "Attendance clock-in already recorded for today");
  }

  const now = new Date();
  const attendance = await Attendance.create({
    userId: req.user._id,
    date: today,
    clockIn: now,
    lastHeartbeatAt: now, // Baseline established immediately at punch in
    status: "in-progress",
    ipAddress: clientIp,
  });

  return ApiResponse.send(res, 201, attendance, "Clocked in successfully");
});

export const recordHeartbeat = asyncHandler(async (req, res) => {
  const today = getLocalDateString();

  const attendance = await Attendance.findOne({
    userId: req.user._id,
    date: today,
    status: "in-progress",
  });

  if (!attendance) {
    return ApiResponse.send(res, 200, null, "No active punch found for today");
  }

  const now = new Date();

  // If first heartbeat after server update, initialize baseline
  if (!attendance.lastHeartbeatAt) {
    attendance.lastHeartbeatAt = attendance.clockIn || now;
  }

  const diffSeconds = Math.floor(
    (now.getTime() - new Date(attendance.lastHeartbeatAt).getTime()) / 1000,
  );

  // If called within 45 seconds (page refresh spam), return current minutes without incrementing
  if (diffSeconds < 45) {
    return ApiResponse.send(
      res,
      200,
      { activeMinutes: attendance.activeMinutes || 0 },
      "Cooldown active (anti-refresh)",
    );
  }

  // Add 1 minute
  attendance.activeMinutes = (attendance.activeMinutes || 0) + 1;
  attendance.lastHeartbeatAt = now;
  await attendance.save();

  return ApiResponse.send(
    res,
    200,
    { activeMinutes: attendance.activeMinutes },
    "Heartbeat incremented (+1m)",
  );
});

export const clockOut1 = asyncHandler(async (req, res) => {
  const today = getLocalDateString();

  const log = await Attendance.findOne({ userId: req.user._id, date: today });
  if (!log) {
    throw new ApiError(404, "No clock-in record found for today");
  }
  if (log.clockOut) {
    throw new ApiError(400, "Clock-out already performed for today");
  }

  const clockOutTime = new Date();
  log.clockOut = clockOutTime;

  // Active verified hours derived from heartbeats (5 mins per ping)
  const activeHours = parseFloat(((log.activeMinutes || 5) / 60).toFixed(2));
  log.totalHours = activeHours;

  // Evaluation based on verified active hours
  if (activeHours >= 9) {
    log.status = "present"; // Full Day
  } else if (activeHours >= 7 && activeHours < 9) {
    log.status = "short-leave"; // Short Leave
  } else if (activeHours >= 5 && activeHours < 7) {
    log.status = "half-day"; // Half Day
  } else {
    log.status = "absent"; // Under 5 hours active
  }

  await log.save();

  return ApiResponse.send(res, 200, log, "Clocked out successfully");
});

export const clockOut09102026 = asyncHandler(async (req, res) => {
  // Use today's local date string or matching date query
  const today = getLocalDateString
    ? getLocalDateString()
    : new Date().toISOString().split("T")[0];

  const log = await Attendance.findOne({ userId: req.user._id, date: today });
  if (!log) {
    throw new ApiError(404, "No clock-in record found for today");
  }
  if (log.clockOut) {
    throw new ApiError(400, "Clock-out already performed for today");
  }

  const clockOutTime = new Date();
  log.clockOut = clockOutTime;

  // 1. Calculate TRUE elapsed wall-clock duration between Clock In and Clock Out
  const diffMs = clockOutTime.getTime() - new Date(log.clockIn).getTime();
  const totalHours = parseFloat(
    Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2),
  );

  log.totalHours = totalHours;
  log.activeMinutes = Math.round(totalHours * 60);

  // 2. Assign correct status tier
  if (totalHours >= 9) {
    log.status = "present"; // Full Day (9+ hrs)
  } else if (totalHours >= 7) {
    log.status = "short-leave"; // Short Leave (7-9 hrs)
  } else if (totalHours >= 5) {
    log.status = "half-day"; // Half Day (5-7 hrs)
  } else {
    log.status = "absent"; // Under 5 hrs
  }

  await log.save();

  return ApiResponse.send(res, 200, log, "Clocked out successfully");
});
export const clockOut = asyncHandler(async (req, res) => {
  // Use today's local date string or matching date query
  const today = getLocalDateString
    ? getLocalDateString()
    : new Date().toISOString().split("T")[0];

  const log = await Attendance.findOne({ userId: req.user._id, date: today });
  if (!log) {
    throw new ApiError(404, "No clock-in record found for today");
  }
  if (log.clockOut) {
    throw new ApiError(400, "Clock-out already performed for today");
  }

  const clockOutTime = new Date();
  log.clockOut = clockOutTime;

  // 1. Calculate TRUE elapsed wall-clock duration between Clock In and Clock Out
  const diffMs = clockOutTime.getTime() - new Date(log.clockIn).getTime();
  const totalHours = parseFloat(
    Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2),
  );

  log.totalHours = totalHours;
  log.activeMinutes = Math.round(totalHours * 60);

  // 2. Assign correct status tier
  if (totalHours >= 9) {
    log.status = "present"; // Full Day (9+ hrs)
  } else if (totalHours >= 7) {
    log.status = "short-leave"; // Short Leave (7-9 hrs)
  } else if (totalHours >= 5) {
    log.status = "half-day"; // Half Day (5-7 hrs)
  } else {
    log.status = "absent"; // Under 5 hrs
  }

  // 3. Weekend COFF Automation (Saturday = 6, Sunday = 0)
  const dayOfWeek = clockOutTime.getDay();
  let coffEarned = 0;

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (totalHours >= 9) {
      coffEarned = 1; // 1 Full COFF for 9+ hours
    } else if (totalHours >= 5) {
      coffEarned = 0.5; // 0.5 Half COFF for 5 to 9 hours
    }

    if (coffEarned > 0) {
      // Atomically credit COFF to the user's leave balance
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { "leaveBalance.coff": coffEarned },
      });
    }
  }

  await log.save();

  const successMessage =
    coffEarned > 0
      ? `Clocked out successfully! ${coffEarned} Compensatory Off (COFF) added to your balance.`
      : "Clocked out successfully";

  return ApiResponse.send(res, 200, { log, coffEarned }, successMessage);
});

export const getTodayStatus1 = asyncHandler(async (req, res) => {
  const today = getLocalDateString();
  const log = await Attendance.findOne({ userId: req.user._id, date: today });
  return ApiResponse.send(res, 200, log, "Daily attendance record");
});

export const getTodayStatus = asyncHandler(async (req, res) => {
  const today = getLocalDateString
    ? getLocalDateString()
    : new Date().toISOString().split("T")[0];
  const log = await Attendance.findOne({ userId: req.user._id, date: today });

  if (log && log.clockIn && log.clockOut) {
    const diffMs =
      new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime();
    const correctHours = parseFloat(
      Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2),
    );

    if (log.totalHours !== correctHours) {
      log.totalHours = correctHours;
      log.activeMinutes = Math.round(correctHours * 60);
      if (correctHours >= 9) log.status = "present";
      else if (correctHours >= 7) log.status = "short-leave";
      else if (correctHours >= 5) log.status = "half-day";
      else log.status = "absent";
      await log.save();
    }
  }

  return ApiResponse.send(res, 200, log, "Today status retrieved");
});

export const getMyHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  const { month, year } = req.query;
  const filter = { userId: req.user._id };

  if (month && year) {
    const monthStr = String(month).padStart(2, "0");
    filter.date = { $regex: `^${year}-${monthStr}` };
  } else if (year) {
    filter.date = { $regex: `^${year}-` };
  }

  const [records, total] = await Promise.all([
    Attendance.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
    Attendance.countDocuments(filter),
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
    "Attendance history fetched successfully",
  );
});

export const getMyHistorynew = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  // If admin passes userId, query for that employee; otherwise query own records
  let targetUserId = req.user._id;
  if (req.user.role === "admin" && req.query.userId) {
    targetUserId = req.query.userId;
  }

  const query = { userId: targetUserId };

  if (month && year) {
    const formattedMonth = String(month).padStart(2, "0");
    const regex = new RegExp(`^\({year}-\){formattedMonth}`);
    query.date = { $regex: regex };
  }

  const records = await Attendance.find(query).sort({ date: 1 });

  return ApiResponse.send(
    res,
    200,
    { records },
    "Attendance records retrieved successfully",
  );
});

export const getStatusFromHours = (hours) => {
  if (hours >= 9) return "Full Day"; // >= 9 hours
  if (hours >= 7) return "Short Leave"; // 7.00 - 8.99 hours
  if (hours >= 5) return "Half Day"; // 5.00 - 6.99 hours
  return "Absent"; // < 5 hours
};

// Inside your attendance submission/punch controller:
export const recordAttendanceOrPunch = asyncHandler(async (req, res) => {
  const { workingHours, date } = req.body; // workingHours as number (e.g. 5, 9)
  const attendanceDate = new Date(date || Date.now());
  const dayOfWeek = attendanceDate.getDay(); // 0 = Sunday, 6 = Saturday

  // Check if it's Saturday (6) or Sunday (0)
  let coffEarned = 0;
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const hours = Number(workingHours || 0);
    if (hours >= 9) {
      coffEarned = 1; // Full COFF
    } else if (hours >= 5) {
      coffEarned = 0.5; // Half COFF
    }
  }

  // If COFF is earned, credit it directly to user's leaveBalance.coff
  if (coffEarned > 0) {
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { "leaveBalance.coff": coffEarned },
    });
  }

  // ... continue with standard attendance recording logic ...
  return ApiResponse.send(
    res,
    200,
    { coffEarned },
    coffEarned > 0
      ? `Weekend work recorded! ${coffEarned} COFF added to your balance.`
      : "Attendance recorded successfully",
  );
});
