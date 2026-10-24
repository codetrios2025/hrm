import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Attendance } from "../models/Attendance.js";
import { Leave } from "../models/Leave.js";
import crypto from "crypto";

import stream from "stream";
import csv from "csv-parser";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { sendCredentialsEmail } from "../utils/email.js";

// Helper to count days between inclusive dates
const getDaysDifference = (start, end) => {
  const d1 = new Date(start);
  const d2 = new Date(end);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// HR Admin applies leave on behalf of an employee directly
export const applyLeaveForEmployee = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, startDate, endDate, reason } = req.body;

  if (!employeeId || !leaveType || !startDate || !endDate) {
    throw new ApiError(
      400,
      "Employee, leave type, start date, and end date are required",
    );
  }

  const targetUser = await User.findById(employeeId);
  if (!targetUser) {
    throw new ApiError(404, "Employee not found");
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) {
    throw new ApiError(400, "Start date cannot be after end date");
  }

  const daysCount = getDaysDifference(startDate, endDate);

  // Check current balance
  const currentBalance = targetUser.leaveBalance?.[leaveType] ?? 0;
  if (currentBalance < daysCount) {
    throw new ApiError(
      400,
      `Insufficient leave balance. ${targetUser.name} only has ${currentBalance} day(s) of ${leaveType} leave left, but ${daysCount} day(s) requested.`,
    );
  }

  // Check overlapping approved leaves
  const overlapping = await Leave.findOne({
    userId: targetUser._id,
    status: "approved",
    $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
  });

  if (overlapping) {
    throw new ApiError(
      400,
      "An approved leave already exists for this employee covering these dates",
    );
  }

  // 1. Create auto-approved leave
  const leave = await Leave.create({
    userId: targetUser._id,
    leaveType,
    startDate: start,
    endDate: end,
    daysCount,
    reason: reason?.trim() || "Leave marked directly by HR Admin",
    status: "approved",
    reviewedBy: req.user._id,
  });

  // 2. Deduct from employee leave quota
  targetUser.leaveBalance[leaveType] = currentBalance - daysCount;
  await targetUser.save();

  return ApiResponse.send(
    res,
    201,
    leave,
    `Successfully assigned ${daysCount} day(s) of ${leaveType} leave for ${targetUser.name}`,
  );
});
// Get all employees and managers with their assigned manager info
// export const getAllStaff = asyncHandler(async (req, res) => {
//   const staff = await User.find()
//     .populate("reportingManager", "name email role")
//     .select("-password")
//     .sort({ createdAt: -1 });

//   return ApiResponse.send(res, 200, staff, "Staff list retrieved");
// });
// Provision employee/manager and send credentials email
export const createStaffUserold = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    role,
    reportingManager,
    casualLeave,
    sickLeave,
    paidLeave,
  } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "A user with this email address already exists");
  }

  // Generate a random temporary 10-character alphanumeric password
  const temporaryPassword = crypto.randomBytes(5).toString("hex") + "!1A";

  const newUser = await User.create({
    name,
    email,
    password: temporaryPassword, // Mongoose pre-save hook will hash this
    role,
    reportingManager: reportingManager || null,
    leaveBalance: {
      casual: casualLeave ?? 12,
      sick: sickLeave ?? 8,
      paid: paidLeave ?? 15,
    },
  });

  // Dispatch email notification
  try {
    await sendCredentialsEmail({
      name: newUser.name,
      email: newUser.email,
      password: temporaryPassword,
      role: newUser.role,
    });
  } catch (emailErr) {
    console.error(
      "[Email Error] Failed to send credentials:",
      emailErr.message,
    );
    // User is created; notify HR about the email failure
    return ApiResponse.send(
      res,
      201,
      {
        id: newUser._id,
        email: newUser.email,
        temporaryPassword,
        emailSent: false,
      },
      "User created, but email failed to dispatch. Share temporary password manually.",
    );
  }

  return ApiResponse.send(
    res,
    201,
    { id: newUser._id, email: newUser.email, emailSent: true },
    "Staff user created and credentials sent to their email.",
  );
});

export const createStaffUser1 = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    role,
    reportingManager,
    casualLeave,
    sickLeave,
    paidLeave,
    optionalHoliday,
  } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "A user with this email address already exists");
  }

  const temporaryPassword = crypto.randomBytes(5).toString("hex") + "!1A";

  const newUser = await User.create({
    name,
    email,
    password: temporaryPassword,
    role,
    reportingManager: reportingManager || null,
    leaveBalance: {
      casual: casualLeave ?? 12,
      sick: sickLeave ?? 8,
      paid: paidLeave ?? 12,
      oh: optionalHoliday ?? 2,
    },
  });

  try {
    await sendCredentialsEmail({
      name: newUser.name,
      email: newUser.email,
      password: temporaryPassword,
      role: newUser.role,
    });
  } catch (emailErr) {
    console.error(
      "[Email Error] Failed to send credentials:",
      emailErr.message,
    );
    return ApiResponse.send(
      res,
      201,
      {
        id: newUser._id,
        email: newUser.email,
        temporaryPassword,
        emailSent: false,
      },
      "User created, but email failed to dispatch. Share temporary password manually.",
    );
  }

  return ApiResponse.send(
    res,
    201,
    { id: newUser._id, email: newUser.email, emailSent: true },
    "Staff user created and credentials sent to their email.",
  );
});

// Bulk import/upsert staff using atomic transaction
export const bulkImportStaffold = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }

  const rows = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  await new Promise((resolve, reject) => {
    bufferStream
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", resolve)
      .on("error", reject);
  });

  if (rows.length === 0) {
    throw new ApiError(400, "The uploaded CSV file contains no data rows");
  }

  // Tracking sets to catch in-file duplicate employeeId and email
  const seenEmployeeIds = new Set();
  const seenEmails = new Set();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validationErrors = [];

  // Phase 1: In-memory schema and row validation
  rows.forEach((row, index) => {
    const rowNum = index + 2; // Accounting for 1-based index and header row
    const employeeId = row.employeeId?.trim()?.toUpperCase();
    const name = row.name?.trim();
    const email = row.email?.trim()?.toLowerCase();
    const role = row.role?.trim()?.toLowerCase();

    if (!employeeId)
      validationErrors.push(`Row ${rowNum}: employeeId is required.`);
    if (!name) validationErrors.push(`Row ${rowNum}: name is required.`);
    if (!email || !emailRegex.test(email))
      validationErrors.push(`Row ${rowNum}: valid email is required.`);
    if (!["employee", "manager", "admin"].includes(role)) {
      validationErrors.push(
        `Row ${rowNum}: role must be 'employee', 'manager', or 'admin'.`,
      );
    }

    if (employeeId) {
      if (seenEmployeeIds.has(employeeId)) {
        validationErrors.push(
          `Row ${rowNum}: Duplicate employeeId '${employeeId}' found in CSV.`,
        );
      }
      seenEmployeeIds.add(employeeId);
    }

    if (email) {
      if (seenEmails.has(email)) {
        validationErrors.push(
          `Row ${rowNum}: Duplicate email '${email}' found in CSV.`,
        );
      }
      seenEmails.add(email);
    }
  });

  // If any row fails validation, abort before database operations
  if (validationErrors.length > 0) {
    throw new ApiError(
      400,
      `Bulk upload aborted due to validation errors: ${validationErrors.join(" ")}`,
    );
  }

  // Pre-fetch all manager/user mappings for reportingManager lookup
  const managerEmployeeIds = rows
    .map((r) => r.reportingManagerEmployeeId?.trim()?.toUpperCase())
    .filter(Boolean);

  const existingManagers = await User.find({
    employeeId: { $in: managerEmployeeIds },
  }).select("_id employeeId role");

  const managerMap = new Map();
  existingManagers.forEach((m) => managerMap.set(m.employeeId, m._id));

  // Phase 2: Start MongoDB Atomic Session
  const session = await mongoose.startSession();
  session.startTransaction();

  const emailsToDispatch = [];
  let insertedCount = 0;
  let updatedCount = 0;

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const employeeId = row.employeeId.trim().toUpperCase();
      const email = row.email.trim().toLowerCase();
      const name = row.name.trim();
      const role = row.role.trim().toLowerCase();
      const managerRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();

      let reportingManagerId = null;
      if (managerRef) {
        if (!managerMap.has(managerRef)) {
          throw new Error(
            `Row ${rowNum}: Reporting manager with employeeId '${managerRef}' was not found in the system.`,
          );
        }
        reportingManagerId = managerMap.get(managerRef);
      }

      // Check if user exists by unique employeeId
      const existingUser = await User.findOne({ employeeId }).session(session);

      // Verify email conflict with another employee
      const emailConflict = await User.findOne({
        email,
        employeeId: { $ne: employeeId },
      }).session(session);
      if (emailConflict) {
        throw new Error(
          `Row ${rowNum}: Email '${email}' belongs to another employee (${emailConflict.employeeId}).`,
        );
      }

      const casual =
        row.casualLeave !== undefined && row.casualLeave !== ""
          ? Number(row.casualLeave)
          : 12;
      const sick =
        row.sickLeave !== undefined && row.sickLeave !== ""
          ? Number(row.sickLeave)
          : 8;
      const paid =
        row.paidLeave !== undefined && row.paidLeave !== ""
          ? Number(row.paidLeave)
          : 15;
      const oh =
        row.optionalHoliday !== undefined && row.optionalHoliday !== ""
          ? Number(row.optionalHoliday)
          : 2;

      if (existingUser) {
        // UPDATE EXISTING USER
        existingUser.name = name;
        existingUser.email = email;
        existingUser.role = role;
        if (reportingManagerId !== null)
          existingUser.reportingManager = reportingManagerId;
        existingUser.leaveBalance = { casual, sick, paid, oh };
        await existingUser.save({ session });
        updatedCount++;
      } else {
        // CREATE NEW USER
        const rawPassword = crypto.randomBytes(5).toString("hex") + "!1A";
        const hashedPassword = await bcrypt.hash(rawPassword, 12);

        await User.create(
          [
            {
              employeeId,
              name,
              email,
              password: hashedPassword,
              role,
              reportingManager: reportingManagerId,
              leaveBalance: { casual, sick, paid, oh },
            },
          ],
          { session },
        );

        emailsToDispatch.push({ name, email, password: rawPassword, role });
        insertedCount++;
      }
    }

    // Commit all changes if no row failed
    await session.commitTransaction();
  } catch (err) {
    // If any row failed, abort transaction so nothing is written
    await session.abortTransaction();
    throw new ApiError(
      400,
      `Import failed and all changes rolled back: ${err.message}`,
    );
  } finally {
    session.endSession();
  }

  // Asynchronously dispatch credentials for newly created accounts
  emailsToDispatch.forEach((item) => {
    sendCredentialsEmail(item).catch((err) =>
      console.error(`[Bulk Email Dispatch Error] ${item.email}:`, err.message),
    );
  });

  return ApiResponse.send(
    res,
    200,
    { insertedCount, updatedCount, totalProcessed: rows.length },
    `Bulk import completed: ${insertedCount} new accounts created, ${updatedCount} existing accounts updated.`,
  );
});

export const bulkImportStaff = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }

  const rows = [];
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  await new Promise((resolve, reject) => {
    bufferStream
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", resolve)
      .on("error", reject);
  });

  if (rows.length === 0) {
    throw new ApiError(400, "The uploaded CSV file contains no data rows");
  }

  // --- PHASE 1: Syntax & In-File Checks ---
  const seenEmployeeIds = new Set();
  const seenEmails = new Set();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validationErrors = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const employeeId = row.employeeId?.trim()?.toUpperCase();
    const name = row.name?.trim();
    const email = row.email?.trim()?.toLowerCase();
    const role = row.role?.trim()?.toLowerCase();

    if (!employeeId)
      validationErrors.push(`Row ${rowNum}: employeeId is required.`);
    if (!name) validationErrors.push(`Row ${rowNum}: name is required.`);
    if (!email || !emailRegex.test(email))
      validationErrors.push(`Row ${rowNum}: valid email is required.`);
    if (!["employee", "manager", "admin"].includes(role)) {
      validationErrors.push(
        `Row ${rowNum}: role must be 'employee', 'manager', or 'admin'.`,
      );
    }

    if (employeeId) {
      if (seenEmployeeIds.has(employeeId)) {
        validationErrors.push(
          `Row ${rowNum}: Duplicate employeeId '${employeeId}' in CSV.`,
        );
      }
      seenEmployeeIds.add(employeeId);
    }

    if (email) {
      if (seenEmails.has(email)) {
        validationErrors.push(
          `Row ${rowNum}: Duplicate email '${email}' in CSV.`,
        );
      }
      seenEmails.add(email);
    }
  });

  if (validationErrors.length > 0) {
    throw new ApiError(
      400,
      `Validation Failed (no records modified): ${validationErrors.join(" ")}`,
    );
  }

  // --- PHASE 2: Database Conflict Pre-checks ---
  const fileEmpIds = Array.from(seenEmployeeIds);
  const fileEmails = Array.from(seenEmails);

  // Pre-fetch all existing users matching any of the CSV IDs or emails
  const existingUsers = await User.find({
    $or: [{ employeeId: { $in: fileEmpIds } }, { email: { $in: fileEmails } }],
  }).select("_id employeeId email role");

  const existingByEmpId = new Map();
  const existingByEmail = new Map();

  existingUsers.forEach((u) => {
    if (u.employeeId) existingByEmpId.set(u.employeeId.toUpperCase(), u);
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u);
  });

  // Verify email collisions with different employeeIds
  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const employeeId = row.employeeId.trim().toUpperCase();
    const email = row.email.trim().toLowerCase();

    const userWithEmail = existingByEmail.get(email);
    if (userWithEmail && userWithEmail.employeeId !== employeeId) {
      validationErrors.push(
        `Row ${rowNum}: Email '${email}' belongs to existing staff member (${userWithEmail.employeeId}).`,
      );
    }
  });

  // Check reporting manager references
  const managerRefs = rows
    .map((r) => r.reportingManagerEmployeeId?.trim()?.toUpperCase())
    .filter(Boolean);

  let managersFromDb = [];
  if (managerRefs.length > 0) {
    managersFromDb = await User.find({
      employeeId: { $in: managerRefs },
    }).select("_id employeeId role");
  }

  const managerIdMap = new Map();
  managersFromDb.forEach((m) =>
    managerIdMap.set(m.employeeId.toUpperCase(), m._id),
  );

  // Also account for managers declared in the same file
  rows.forEach((r) => {
    if (["manager", "admin"].includes(r.role?.trim()?.toLowerCase())) {
      const empId = r.employeeId?.trim()?.toUpperCase();
      if (empId && !managerIdMap.has(empId)) {
        managerIdMap.set(empId, "PENDING_RESOLVE");
      }
    }
  });

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const mgrRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();
    if (mgrRef && !managerIdMap.has(mgrRef)) {
      validationErrors.push(
        `Row ${rowNum}: Manager ID '${mgrRef}' does not exist in the database or this file.`,
      );
    }
  });

  // If ANY check failed, stop before touching the database
  if (validationErrors.length > 0) {
    throw new ApiError(400, `Import rejected: ${validationErrors.join(" ")}`);
  }

  // --- PHASE 3: Atomic Batch Execution (All-or-Nothing Prepared Writes) ---
  const emailsToDispatch = [];
  let insertedCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const employeeId = row.employeeId.trim().toUpperCase();
    const name = row.name.trim();
    const email = row.email.trim().toLowerCase();
    const role = row.role.trim().toLowerCase();
    const mgrRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();

    let reportingManager = null;
    if (mgrRef) {
      const resolved = managerIdMap.get(mgrRef);
      if (resolved && resolved !== "PENDING_RESOLVE") {
        reportingManager = resolved;
      } else {
        const found = await User.findOne({ employeeId: mgrRef }).select("_id");
        if (found) reportingManager = found._id;
      }
    }

    const casual =
      row.casualLeave !== undefined && row.casualLeave !== ""
        ? Number(row.casualLeave)
        : 12;
    const sick =
      row.sickLeave !== undefined && row.sickLeave !== ""
        ? Number(row.sickLeave)
        : 8;
    const paid =
      row.paidLeave !== undefined && row.paidLeave !== ""
        ? Number(row.paidLeave)
        : 15;
    const oh =
      row.optionalHoliday !== undefined && row.optionalHoliday !== ""
        ? Number(row.optionalHoliday)
        : 2;

    const existingUser = existingByEmpId.get(employeeId);

    if (existingUser) {
      // Update existing record
      await User.findByIdAndUpdate(existingUser._id, {
        name,
        email,
        role,
        ...(reportingManager && { reportingManager }),
        leaveBalance: { casual, sick, paid, oh },
      });
      updatedCount++;
    } else {
      // Create new record with credentials
      const rawPassword = crypto.randomBytes(5).toString("hex") + "!1A";
      const hashedPassword = await bcrypt.hash(rawPassword, 12);

      const created = await User.create({
        employeeId,
        name,
        email,
        password: hashedPassword,
        role,
        reportingManager,
        leaveBalance: { casual, sick, paid, oh },
      });

      // Update map so subsequent rows in same file can reference this manager
      managerIdMap.set(employeeId, created._id);

      emailsToDispatch.push({ name, email, password: rawPassword, role });
      insertedCount++;
    }
  }

  // Phase 4: Dispatch credential emails in background
  emailsToDispatch.forEach((item) => {
    sendCredentialsEmail(item).catch((err) =>
      console.error(`[Bulk Email Dispatch Error] ${item.email}:`, err.message),
    );
  });

  return ApiResponse.send(
    res,
    200,
    { insertedCount, updatedCount, totalProcessed: rows.length },
    `Import successful: ${insertedCount} new users created, ${updatedCount} existing users updated.`,
  );
});

// Update single staff creation to accept employeeId
export const createStaffUser = asyncHandler(async (req, res) => {
  const {
    employeeId,
    name,
    email,
    role,
    reportingManager,
    casualLeave,
    sickLeave,
    paidLeave,
    optionalHoliday,
  } = req.body;

  const existingId = await User.findOne({
    employeeId: employeeId.trim().toUpperCase(),
  });
  if (existingId) {
    throw new ApiError(
      409,
      "A staff member with this Employee ID already exists",
    );
  }

  const existingEmail = await User.findOne({
    email: email.trim().toLowerCase(),
  });
  if (existingEmail) {
    throw new ApiError(409, "A user with this email address already exists");
  }

  const temporaryPassword = crypto.randomBytes(5).toString("hex") + "!1A";

  const newUser = await User.create({
    employeeId: employeeId.trim().toUpperCase(),
    name,
    email: email.trim().toLowerCase(),
    password: temporaryPassword,
    role,
    reportingManager: reportingManager || null,
    leaveBalance: {
      casual: casualLeave ?? 12,
      sick: sickLeave ?? 8,
      paid: paidLeave ?? 15,
      oh: optionalHoliday ?? 2,
    },
  });

  try {
    await sendCredentialsEmail({
      name: newUser.name,
      email: newUser.email,
      password: temporaryPassword,
      role: newUser.role,
    });
  } catch (emailErr) {
    console.error(
      "[Email Error] Failed to send credentials:",
      emailErr.message,
    );
    return ApiResponse.send(
      res,
      201,
      {
        id: newUser._id,
        employeeId: newUser.employeeId,
        email: newUser.email,
        temporaryPassword,
        emailSent: false,
      },
      "User created, but email failed to dispatch. Share credentials manually.",
    );
  }

  return ApiResponse.send(
    res,
    201,
    {
      id: newUser._id,
      employeeId: newUser.employeeId,
      email: newUser.email,
      emailSent: true,
    },
    "Staff user created and credentials sent via email.",
  );
});

// Update employee details (Name, Email, Role)
export const updateStaffDetails = asyncHandler(async (req, res) => {
  const { employeeId, name, email, role } = req.body;

  // Check if another account already uses this email
  const existingEmail = await User.findOne({ email, _id: { $ne: employeeId } });
  if (existingEmail) {
    throw new ApiError(
      409,
      "Another user is already registered with this email address",
    );
  }

  // Prevent admin from accidentally demoting their own active account
  if (req.user._id.toString() === employeeId && role !== "admin") {
    throw new ApiError(400, "You cannot demote your own Admin account");
  }

  const updatedStaff = await User.findByIdAndUpdate(
    employeeId,
    { name, email, role },
    { new: true, runValidators: true },
  ).select("-password");

  if (!updatedStaff) {
    throw new ApiError(404, "Staff member not found");
  }

  return ApiResponse.send(
    res,
    200,
    updatedStaff,
    "Staff details updated successfully",
  );
});

// Toggle Staff Account Activation (Active <-> Deactivated)
export const toggleStaffStatus = asyncHandler(async (req, res) => {
  const { employeeId } = req.body;

  if (req.user._id.toString() === employeeId) {
    throw new ApiError(400, "You cannot deactivate your own Admin account");
  }

  const targetUser = await User.findById(employeeId);
  if (!targetUser) {
    throw new ApiError(404, "Staff member not found");
  }

  targetUser.isActive = !targetUser.isActive;
  await targetUser.save();

  const statusLabel = targetUser.isActive ? "activated" : "deactivated";
  return ApiResponse.send(
    res,
    200,
    targetUser,
    `User has been successfully ${statusLabel}`,
  );
});

export const getAllStaff = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 5);
  const skip = (page - 1) * limit;

  const [staff, total, managers] = await Promise.all([
    User.find()
      .populate("reportingManager", "name email role")
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(),
    // Also fetch all managers so the dropdown always has complete options
    User.find({ role: { $in: ["manager", "admin"] } }).select("name role"),
  ]);

  return ApiResponse.send(
    res,
    200,
    {
      staff,
      managers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Staff list retrieved successfully",
  );
});

// Assign or update reporting manager for an employee
export const assignManager = asyncHandler(async (req, res) => {
  const { employeeId, managerId } = req.body;

  if (employeeId === managerId) {
    throw new ApiError(
      400,
      "An employee cannot be assigned as their own manager",
    );
  }

  if (managerId) {
    const manager = await User.findById(managerId);
    if (!manager || !["manager", "admin"].includes(manager.role)) {
      throw new ApiError(
        400,
        "Assigned user must have a Manager or Admin role",
      );
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    employeeId,
    { reportingManager: managerId || null },
    { new: true },
  ).populate("reportingManager", "name email");

  if (!updatedUser) {
    throw new ApiError(404, "Employee not found");
  }

  return ApiResponse.send(
    res,
    200,
    updatedUser,
    "Manager assigned successfully",
  );
});

// Adjust leave balance (Casual, Sick, Paid) for any user
export const updateLeaveBalanceold = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, amount } = req.body;

  if (!["casual", "sick", "paid"].includes(leaveType)) {
    throw new ApiError(400, "Invalid leave type");
  }

  const updatedUser = await User.findByIdAndUpdate(
    employeeId,
    { [`leaveBalance.${leaveType}`]: Math.max(0, Number(amount)) },
    { new: true },
  ).select("-password");

  if (!updatedUser) {
    throw new ApiError(404, "Employee not found");
  }

  return ApiResponse.send(
    res,
    200,
    updatedUser,
    "Leave balance adjusted successfully",
  );
});

export const updateLeaveBalance = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, amount } = req.body;

  if (!["casual", "sick", "paid", "oh"].includes(leaveType)) {
    throw new ApiError(400, "Invalid leave type");
  }

  const updatedUser = await User.findByIdAndUpdate(
    employeeId,
    { [`leaveBalance.${leaveType}`]: Math.max(0, Number(amount)) },
    { new: true },
  ).select("-password");

  if (!updatedUser) {
    throw new ApiError(404, "Employee not found");
  }

  return ApiResponse.send(
    res,
    200,
    updatedUser,
    "Leave balance adjusted successfully",
  );
});

export const exportAttendanceReport = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.query;

  const filter = {};

  // Individual employee vs All employees
  if (employeeId && employeeId !== "all") {
    filter.userId = employeeId;
  }

  // Filter by Month & Year (YYYY-MM regex)
  if (month && year) {
    const monthFormatted = String(month).padStart(2, "0");
    filter.date = { $regex: `^${year}-${monthFormatted}` };
  } else if (year) {
    filter.date = { $regex: `^${year}-` };
  }

  const records = await Attendance.find(filter)
    .populate("userId", "name email role")
    .sort({ date: -1, "userId.name": 1 });

  // Prepare CSV Headers
  const headers = [
    "Date",
    "Employee Name",
    "Employee Email",
    "Role",
    "Clock In",
    "Clock Out",
    "Total Hours",
    "Status",
    "IP Address",
  ];

  // Map database records to CSV rows
  const rows = records.map((rec) => {
    const clockInFormatted = rec.clockIn
      ? new Date(rec.clockIn).toLocaleTimeString()
      : "N/A";
    const clockOutFormatted = rec.clockOut
      ? new Date(rec.clockOut).toLocaleTimeString()
      : "N/A";

    return [
      rec.date,
      `"${rec.userId?.name || "Deleted User"}"`,
      `"${rec.userId?.email || "N/A"}"`,
      rec.userId?.role || "N/A",
      `"${clockInFormatted}"`,
      `"${clockOutFormatted}"`,
      rec.totalHours || 0,
      rec.status,
      `"${rec.ipAddress || "N/A"}"`,
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\r\n");

  // Set response headers for file download
  const filename = `attendance_report_${employeeId || "all"}_${year || "all"}_${month || "all"}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  return res.status(200).send(csvContent);
});

export const getLeaveHistoryReportold = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  // We filter by approved leaves to count leaves actually taken
  const filter = { status: "approved" };

  if (employeeId && employeeId !== "all") {
    filter.userId = employeeId;
  }

  if (month && year) {
    const monthStr = String(month).padStart(2, "0");
    filter.startDate = { $regex: `^${year}-${monthStr}` };
  } else if (year) {
    filter.startDate = { $regex: `^${year}` };
  }

  // Fetch paginated records and count
  const [records, total] = await Promise.all([
    Leave.find(filter)
      .populate("userId", "name email employeeId role")
      .populate("reviewedBy", "name email")
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit),
    Leave.countDocuments(filter),
  ]);

  // Aggregate breakdown summary for the filtered criteria
  const summaryAggregate = await Leave.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$leaveType",
        totalDays: { $sum: "$daysCount" },
      },
    },
  ]);

  const summary = {
    total: 0,
    casual: 0,
    paid: 0,
    sick: 0,
    oh: 0,
  };

  summaryAggregate.forEach((item) => {
    if (summary[item._id] !== undefined) {
      summary[item._id] = item.totalDays;
    }
    summary.total += item.totalDays;
  });

  return ApiResponse.send(
    res,
    200,
    {
      records,
      summary,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Leave history report retrieved successfully",
  );
});

export const getLeaveHistoryReport = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  // Filter for approved leaves only
  const filter = { status: "approved" };

  if (employeeId && employeeId !== "all") {
    filter.userId = new mongoose.Types.ObjectId(employeeId);
  }

  // Proper Date object range querying
  if (year) {
    const yr = parseInt(year);
    if (month) {
      const mo = parseInt(month) - 1; // 0-indexed month
      const startRange = new Date(Date.UTC(yr, mo, 1, 0, 0, 0));
      const endRange = new Date(Date.UTC(yr, mo + 1, 1, 0, 0, 0));
      filter.startDate = { $gte: startRange, $lt: endRange };
    } else {
      const startRange = new Date(Date.UTC(yr, 0, 1, 0, 0, 0));
      const endRange = new Date(Date.UTC(yr + 1, 0, 1, 0, 0, 0));
      filter.startDate = { $gte: startRange, $lt: endRange };
    }
  }

  // 1. Fetch paginated records
  const [records, total] = await Promise.all([
    Leave.find(filter)
      .populate("userId", "name email employeeId role")
      .populate("reviewedBy", "name email")
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit),
    Leave.countDocuments(filter),
  ]);

  // 2. Aggregate breakdown summary
  const summaryAggregate = await Leave.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$leaveType",
        totalDays: { $sum: "$daysCount" },
      },
    },
  ]);

  const summary = {
    total: 0,
    casual: 0,
    paid: 0,
    sick: 0,
    oh: 0,
  };

  summaryAggregate.forEach((item) => {
    if (summary[item._id] !== undefined) {
      summary[item._id] = item.totalDays;
    }
    summary.total += item.totalDays;
  });

  return ApiResponse.send(
    res,
    200,
    {
      records,
      summary,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Leave history report retrieved successfully",
  );
});

export const triggerYearEndRollover = asyncHandler(async (req, res) => {
  const staffUsers = await User.find({ isActive: true });
  let processedCount = 0;
  const auditDetails = [];

  for (const user of staffUsers) {
    const prevCasual = user.leaveBalance?.casual || 0;
    const prevOH = user.leaveBalance?.oh || 0;
    const prevPaid = user.leaveBalance?.paid || 0;

    // Convert leftover OH to Paid Leave
    const addedToPaid = prevOH > 0 ? prevOH : 0;
    const newPaid = prevPaid + addedToPaid;

    user.leaveBalance.casual = 0;
    user.leaveBalance.paid = newPaid;
    user.leaveBalance.oh = 2; // Refreshed new year allocation

    await user.save();

    auditDetails.push({
      employeeId: user.employeeId,
      name: user.name,
      lapsedCL: prevCasual,
      convertedOH: prevOH,
      newPaidBalance: newPaid,
    });

    processedCount++;
  }

  return ApiResponse.send(
    res,
    200,
    { processedCount, auditDetails },
    `Year-end rollover complete: Processed ${processedCount} accounts. CL reset to 0, unused OH converted to Paid Leave.`,
  );
});

export const directMarkAttendance = asyncHandler(async (req, res) => {
  const { employeeId, date, startTime, endTime, remarks } = req.body;

  if (!employeeId || !date || !startTime || !endTime) {
    throw new ApiError(
      400,
      "Employee, Date, Clock In, and Clock Out times are required",
    );
  }

  const user = await User.findById(employeeId);
  if (!user) throw new ApiError(404, "Employee not found");

  const clockIn = new Date(`${date}T${startTime}:00`);
  const clockOut = new Date(`${date}T${endTime}:00`);

  if (clockOut <= clockIn) {
    throw new ApiError(400, "Clock Out time must be after Clock In time");
  }

  const diffMs = clockOut.getTime() - clockIn.getTime();
  const totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
  const activeMinutes = Math.round(totalHours * 60);

  let status = "absent";
  if (totalHours >= 9) status = "present";
  else if (totalHours >= 7) status = "short-leave";
  else if (totalHours >= 5) status = "half-day";

  const attendance = await Attendance.findOneAndUpdate(
    { userId: user._id, date },
    {
      userId: user._id,
      date,
      clockIn,
      clockOut,
      totalHours,
      activeMinutes,
      status,
      ipAddress: remarks ? `ADMIN-MANUAL: ${remarks}` : "ADMIN-MANUAL",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return ApiResponse.send(
    res,
    200,
    attendance,
    "Attendance marked successfully by Admin",
  );
});
