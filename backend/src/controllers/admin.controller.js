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

import { sendCredentialsEmail, sendEmailWithPassword } from "../utils/email.js";

// ============================================================
// SUPPORTED LEAVE TYPES
// ============================================================

const VALID_LEAVE_TYPES = [
  "paid",
  "casual",
  "sick",
  "oh",
  "coff",
  "paternity",
  "maternity",
  "bereavement",
  "lwp",
];

// ============================================================
// LEAVE TYPE LABELS
// ============================================================

const LEAVE_TYPE_LABELS = {
  paid: "Paid Leave (PL)",
  casual: "Casual Leave (CL)",
  sick: "Sick Leave (SL)",
  oh: "Optional Holiday (OH)",
  coff: "Compensatory Off (COFF)",
  paternity: "Paternity Leave",
  maternity: "Maternity Leave",
  bereavement: "Bereavement Leave",
  lwp: "Leave Without Pay (LWP)",
};

// ============================================================
// DEFAULT LEAVE BALANCE
// ============================================================

const DEFAULT_LEAVE_BALANCE = {
  paid: 15,
  casual: 12,
  sick: 8,
  oh: 2,
  coff: 0,
  paternity: 0,
  maternity: 0,
  bereavement: 0,
  lwp: 0,
};

// ============================================================
// VALIDATE LEAVE TYPE
// ============================================================

const validateLeaveType = (leaveType) => {
  const normalizedType = String(leaveType || "")
    .trim()
    .toLowerCase();

  if (!VALID_LEAVE_TYPES.includes(normalizedType)) {
    throw new ApiError(
      400,
      `Invalid leave type. Allowed types: ${VALID_LEAVE_TYPES.join(", ")}`,
    );
  }

  return normalizedType;
};

// ============================================================
// GET NUMBER
// ============================================================

const getNumber = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const number = Number(value);

  return Number.isFinite(number) ? Math.max(0, number) : defaultValue;
};

// ============================================================
// COUNT INCLUSIVE DAYS
// ============================================================

const getDaysDifference = (start, end) => {
  const d1 = new Date(start);
  const d2 = new Date(end);

  const diffTime = Math.abs(d2.getTime() - d1.getTime());

  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// ============================================================
// BUILD COMPLETE LEAVE BALANCE
// ============================================================

const buildLeaveBalance = ({
  lwp,
  casualLeave,
  paidLeave,
  sickLeave,
  coffBalance,
  optionalHoliday,
  paternityLeave,
  maternityLeave,
  bereavementLeave,
} = {}) => {
  return {
    // 1. LWP
    lwp: getNumber(lwp, DEFAULT_LEAVE_BALANCE.lwp),

    // 2. Casual Leave
    casual: getNumber(casualLeave, DEFAULT_LEAVE_BALANCE.casual),

    // 3. Paid Leave
    paid: getNumber(paidLeave, DEFAULT_LEAVE_BALANCE.paid),

    // 4. Sick Leave
    sick: getNumber(sickLeave, DEFAULT_LEAVE_BALANCE.sick),

    // 5. COFF
    coff: getNumber(coffBalance, DEFAULT_LEAVE_BALANCE.coff),

    // 6. Optional Holiday
    oh: getNumber(optionalHoliday, DEFAULT_LEAVE_BALANCE.oh),

    // 7. Paternity Leave
    paternity: getNumber(paternityLeave, DEFAULT_LEAVE_BALANCE.paternity),

    // 8. Maternity Leave
    maternity: getNumber(maternityLeave, DEFAULT_LEAVE_BALANCE.maternity),

    // 9. Bereavement Leave
    bereavement: getNumber(bereavementLeave, DEFAULT_LEAVE_BALANCE.bereavement),
  };
};

// ============================================================
// 1. APPLY / FORCE LEAVE FOR EMPLOYEE
// ============================================================

export const applyLeaveForEmployee = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, startDate, endDate, reason } = req.body;

  // --------------------------------------------------------
  // Required fields
  // --------------------------------------------------------

  if (!employeeId || !leaveType || !startDate || !endDate) {
    throw new ApiError(
      400,
      "Employee, leave type, start date, and end date are required",
    );
  }

  // --------------------------------------------------------
  // Normalize leave type
  // --------------------------------------------------------

  const normalizedLeaveType = validateLeaveType(leaveType);

  // --------------------------------------------------------
  // Find employee
  // --------------------------------------------------------

  const targetUser = await User.findById(employeeId);

  if (!targetUser) {
    throw new ApiError(404, "Employee not found");
  }

  // --------------------------------------------------------
  // Validate dates
  // --------------------------------------------------------

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ApiError(400, "Invalid start date or end date");
  }

  if (start > end) {
    throw new ApiError(400, "Start date cannot be after end date");
  }

  // --------------------------------------------------------
  // Calculate days
  // --------------------------------------------------------

  const daysCount = getDaysDifference(startDate, endDate);

  // --------------------------------------------------------
  // Ensure leaveBalance exists
  // --------------------------------------------------------

  if (!targetUser.leaveBalance) {
    targetUser.leaveBalance = {};
  }

  // --------------------------------------------------------
  // Current balance
  // --------------------------------------------------------

  const currentBalance = Number(
    targetUser.leaveBalance?.[normalizedLeaveType] ?? 0,
  );

  // --------------------------------------------------------
  // Check overlapping leaves BEFORE changing balance
  // --------------------------------------------------------

  const overlapping = await Leave.findOne({
    userId: targetUser._id,

    status: {
      $in: ["pending", "approved"],
    },

    $or: [
      {
        startDate: {
          $lte: end,
        },

        endDate: {
          $gte: start,
        },
      },
    ],
  });

  if (overlapping) {
    throw new ApiError(
      400,
      "A leave application already exists for this employee covering these dates",
    );
  }

  // --------------------------------------------------------
  // LWP
  // --------------------------------------------------------

  if (normalizedLeaveType === "lwp") {
    targetUser.leaveBalance.lwp = currentBalance + daysCount;
  } else {
    // ------------------------------------------------------
    // Normal leave
    // ------------------------------------------------------

    if (currentBalance < daysCount) {
      throw new ApiError(
        400,
        `${targetUser.name} has only ${currentBalance} day(s) of ${LEAVE_TYPE_LABELS[normalizedLeaveType]} remaining, but ${daysCount} day(s) were requested.`,
      );
    }

    targetUser.leaveBalance[normalizedLeaveType] = currentBalance - daysCount;
  }

  // --------------------------------------------------------
  // Create approved leave
  // --------------------------------------------------------

  const leave = await Leave.create({
    userId: targetUser._id,

    leaveType: normalizedLeaveType,

    startDate: start,

    endDate: end,

    daysCount,

    reason: reason?.trim() || "Leave marked directly by HR Admin",

    status: "approved",

    reviewedBy: req.user._id,
  });

  // --------------------------------------------------------
  // Save balance
  // --------------------------------------------------------

  await targetUser.save();

  // --------------------------------------------------------
  // Response
  // --------------------------------------------------------

  const message =
    normalizedLeaveType === "lwp"
      ? `${daysCount} day(s) of LWP successfully assigned to ${targetUser.name}.`
      : `${daysCount} day(s) of ${LEAVE_TYPE_LABELS[normalizedLeaveType]} successfully assigned to ${targetUser.name}.`;

  return ApiResponse.send(
    res,
    201,
    {
      leave,

      employee: {
        _id: targetUser._id,
        employeeId: targetUser.employeeId,
        name: targetUser.name,
        email: targetUser.email,
      },

      leaveBalance: targetUser.leaveBalance,
    },

    message,
  );
});

// ============================================================
// 2. CREATE STAFF USER
// Supports all 9 leave types
// ============================================================

export const createStaffUser = asyncHandler(async (req, res) => {
  const {
    employeeId,
    name,
    email,
    role,
    reportingManager,

    paidLeave,
    casualLeave,
    sickLeave,
    optionalHoliday,

    coffBalance,
    paternityLeave,
    maternityLeave,
    bereavementLeave,
    lwp,
  } = req.body;

  // --------------------------------------------------------
  // Validate required fields
  // --------------------------------------------------------

  if (!employeeId || !name || !email || !role) {
    throw new ApiError(400, "Employee ID, name, email, and role are required");
  }

  const normalizedEmployeeId = employeeId.trim().toUpperCase();

  const normalizedEmail = email.trim().toLowerCase();

  const normalizedRole = String(role).trim().toLowerCase();

  // --------------------------------------------------------
  // Validate role
  // --------------------------------------------------------

  if (!["employee", "manager", "admin"].includes(normalizedRole)) {
    throw new ApiError(400, "Invalid role");
  }

  // --------------------------------------------------------
  // Check employee ID
  // --------------------------------------------------------

  const existingId = await User.findOne({
    employeeId: normalizedEmployeeId,
  });

  if (existingId) {
    throw new ApiError(
      409,
      "A staff member with this Employee ID already exists",
    );
  }

  // --------------------------------------------------------
  // Check email
  // --------------------------------------------------------

  const existingEmail = await User.findOne({
    email: normalizedEmail,
  });

  if (existingEmail) {
    throw new ApiError(409, "A user with this email address already exists");
  }

  // --------------------------------------------------------
  // Validate reporting manager
  // --------------------------------------------------------

  if (reportingManager) {
    const manager = await User.findById(reportingManager);

    if (!manager || !["manager", "admin"].includes(manager.role)) {
      throw new ApiError(400, "Reporting manager must be a Manager or Admin");
    }
  }

  // --------------------------------------------------------
  // Generate temporary password
  // --------------------------------------------------------

  const temporaryPassword = crypto.randomBytes(5).toString("hex") + "!1A";

  // --------------------------------------------------------
  // Build all 9 balances
  // --------------------------------------------------------

  const leaveBalance = buildLeaveBalance({
    paidLeave,
    casualLeave,
    sickLeave,
    optionalHoliday,

    coffBalance,
    paternityLeave,
    maternityLeave,
    bereavementLeave,
    lwp,
  });

  // --------------------------------------------------------
  // Create user
  // --------------------------------------------------------

  const newUser = await User.create({
    employeeId: normalizedEmployeeId,

    name: name.trim(),

    email: normalizedEmail,

    password: temporaryPassword,

    role: normalizedRole,

    reportingManager: reportingManager || null,

    leaveBalance,
  });

  // --------------------------------------------------------
  // Send credentials
  // --------------------------------------------------------

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

// Keep old imports working
export const createStaffUserold = createStaffUser;

export const createStaffUser1 = createStaffUser;

// ============================================================
// 3. BULK IMPORT STAFF
// Supports all 9 leave types
// ============================================================

export const bulkImportStaff22 = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }

  // --------------------------------------------------------
  // Read CSV
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // Validation
  // --------------------------------------------------------

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

    if (!employeeId) {
      validationErrors.push(`Row ${rowNum}: employeeId is required.`);
    }

    if (!name) {
      validationErrors.push(`Row ${rowNum}: name is required.`);
    }

    if (!email || !emailRegex.test(email)) {
      validationErrors.push(`Row ${rowNum}: valid email is required.`);
    }

    if (!["employee", "manager", "admin"].includes(role)) {
      validationErrors.push(
        `Row ${rowNum}: role must be employee, manager, or admin.`,
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

    // ----------------------------------------------------
    // Validate all 9 balances
    // ----------------------------------------------------

    // const balanceFields = [
    //   "paidLeave",
    //   "casualLeave",
    //   "sickLeave",
    //   "optionalHoliday",
    //   "coffBalance",
    //   "paternityLeave",
    //   "maternityLeave",
    //   "bereavementLeave",
    //   "lwp",
    // ];
    const balanceFields = [
      "lwp",
      "casualLeave",
      "paidLeave",
      "sickLeave",
      "coffBalance",
      "optionalHoliday",
      "paternityLeave",
      "maternityLeave",
      "bereavementLeave",
    ];

    balanceFields.forEach((field) => {
      if (row[field] !== undefined && row[field] !== "") {
        const value = Number(row[field]);

        if (!Number.isFinite(value) || value < 0) {
          validationErrors.push(
            `Row ${rowNum}: ${field} must be a valid number >= 0.`,
          );
        }
      }
    });
  });

  if (validationErrors.length > 0) {
    throw new ApiError(400, `Validation failed: ${validationErrors.join(" ")}`);
  }

  // --------------------------------------------------------
  // Existing users
  // --------------------------------------------------------

  const employeeIds = Array.from(seenEmployeeIds);

  const emails = Array.from(seenEmails);

  const existingUsers = await User.find({
    $or: [
      {
        employeeId: {
          $in: employeeIds,
        },
      },

      {
        email: {
          $in: emails,
        },
      },
    ],
  }).select("_id employeeId email role");

  const existingByEmpId = new Map();

  const existingByEmail = new Map();

  existingUsers.forEach((user) => {
    if (user.employeeId) {
      existingByEmpId.set(user.employeeId.toUpperCase(), user);
    }

    if (user.email) {
      existingByEmail.set(user.email.toLowerCase(), user);
    }
  });

  // --------------------------------------------------------
  // Email conflict
  // --------------------------------------------------------

  rows.forEach((row, index) => {
    const rowNum = index + 2;

    const employeeId = row.employeeId.trim().toUpperCase();

    const email = row.email.trim().toLowerCase();

    const emailUser = existingByEmail.get(email);

    if (emailUser && emailUser.employeeId?.toUpperCase() !== employeeId) {
      validationErrors.push(
        `Row ${rowNum}: Email '${email}' belongs to another employee (${emailUser.employeeId}).`,
      );
    }
  });

  // --------------------------------------------------------
  // Manager mapping
  // --------------------------------------------------------

  const managerRefs = rows
    .map((row) => row.reportingManagerEmployeeId?.trim()?.toUpperCase())
    .filter(Boolean);

  const managerUsers = managerRefs.length
    ? await User.find({
        employeeId: {
          $in: managerRefs,
        },
      }).select("_id employeeId role")
    : [];

  const managerIdMap = new Map();

  managerUsers.forEach((manager) => {
    managerIdMap.set(manager.employeeId.toUpperCase(), manager._id);
  });

  // Managers inside CSV
  rows.forEach((row) => {
    const role = row.role?.trim()?.toLowerCase();

    if (["manager", "admin"].includes(role)) {
      const id = row.employeeId?.trim()?.toUpperCase();

      if (id && !managerIdMap.has(id)) {
        managerIdMap.set(id, "PENDING_RESOLVE");
      }
    }
  });

  rows.forEach((row, index) => {
    const rowNum = index + 2;

    const managerRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();

    if (managerRef && !managerIdMap.has(managerRef)) {
      validationErrors.push(
        `Row ${rowNum}: Manager ID '${managerRef}' does not exist.`,
      );
    }
  });

  if (validationErrors.length > 0) {
    throw new ApiError(400, `Import rejected: ${validationErrors.join(" ")}`);
  }

  // --------------------------------------------------------
  // Insert / Update
  // --------------------------------------------------------

  let insertedCount = 0;
  let updatedCount = 0;

  const emailsToDispatch = [];

  for (const row of rows) {
    const employeeId = row.employeeId.trim().toUpperCase();

    const name = row.name.trim();

    const email = row.email.trim().toLowerCase();

    const role = row.role.trim().toLowerCase();

    const managerRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();

    let reportingManager = null;

    if (managerRef) {
      const resolved = managerIdMap.get(managerRef);

      if (resolved && resolved !== "PENDING_RESOLVE") {
        reportingManager = resolved;
      } else {
        const manager = await User.findOne({
          employeeId: managerRef,
        }).select("_id");

        if (manager) {
          reportingManager = manager._id;
        }
      }
    }

    // ------------------------------------------------------
    // All 9 balances
    // ------------------------------------------------------

    const leaveBalance = buildLeaveBalance({
      lwp: row.lwp,
      casualLeave: row.casualLeave,
      paidLeave: row.paidLeave,
      sickLeave: row.sickLeave,
      coffBalance: row.coffBalance,
      optionalHoliday: row.optionalHoliday,
      paternityLeave: row.paternityLeave,
      maternityLeave: row.maternityLeave,
      bereavementLeave: row.bereavementLeave,
    });

    // ------------------------------------------------------
    // Existing employee
    // ------------------------------------------------------

    const existingUser = existingByEmpId.get(employeeId);

    if (existingUser) {
      existingUser.name = name;

      existingUser.email = email;

      existingUser.role = role;

      if (reportingManager) {
        existingUser.reportingManager = reportingManager;
      }

      existingUser.leaveBalance = leaveBalance;

      await existingUser.save();

      updatedCount++;
    } else {
      // ----------------------------------------------------
      // New employee
      // ----------------------------------------------------

      const rawPassword = crypto.randomBytes(5).toString("hex") + "!1A";

      const hashedPassword = await bcrypt.hash(rawPassword, 12);

      const created = await User.create({
        employeeId,

        name,

        email,

        password: rawPassword,

        role,

        reportingManager,

        leaveBalance,
      });

      managerIdMap.set(employeeId, created._id);

      emailsToDispatch.push({
        name,
        email,
        password: rawPassword,
        role,
      });

      insertedCount++;
    }
  }

  // --------------------------------------------------------
  // Send emails
  // --------------------------------------------------------

  emailsToDispatch.forEach((item) => {
    sendCredentialsEmail(item).catch((err) =>
      console.error(`[Bulk Email Error] ${item.email}:`, err.message),
    );
  });

  return ApiResponse.send(
    res,
    200,
    {
      insertedCount,
      updatedCount,
      totalProcessed: rows.length,
    },
    `Import successful: ${insertedCount} new users created, ${updatedCount} existing users updated.`,
  );
});

export const bulkImportStaff = asyncHandler(async (req, res) => {
  // ========================================================
  // 1. CHECK FILE
  // ========================================================

  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }

  // ========================================================
  // 2. READ CSV
  // ========================================================

  const rows = [];

  const bufferStream = new stream.PassThrough();

  bufferStream.end(req.file.buffer);

  await new Promise((resolve, reject) => {
    bufferStream
      .pipe(csv())
      .on("data", (data) => {
        rows.push(data);
      })
      .on("end", resolve)
      .on("error", reject);
  });

  // ========================================================
  // 3. REMOVE COMPLETELY EMPTY ROWS
  // ========================================================
  // Excel can add blank rows at the bottom.
  // Those rows were previously being treated as staff rows.

  const validRows = rows.filter((row) => {
    return Object.values(row).some(
      (value) => String(value ?? "").trim() !== "",
    );
  });

  if (validRows.length === 0) {
    throw new ApiError(400, "The uploaded CSV file contains no data rows");
  }

  // ========================================================
  // 4. VALIDATION
  // ========================================================

  const seenEmployeeIds = new Set();
  const seenEmails = new Set();

  // Correct email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validationErrors = [];

  validRows.forEach((row, index) => {
    const rowNum = index + 2;

    const employeeId = row.employeeId?.trim()?.toUpperCase();

    const name = row.name?.trim();

    const email = row.email?.trim()?.toLowerCase();

    const role = row.role?.trim()?.toLowerCase();

    // ------------------------------------------------------
    // Required fields
    // ------------------------------------------------------

    if (!employeeId) {
      validationErrors.push(`Row ${rowNum}: employeeId is required.`);
    }

    if (!name) {
      validationErrors.push(`Row ${rowNum}: name is required.`);
    }

    if (!email || !emailRegex.test(email)) {
      validationErrors.push(`Row ${rowNum}: valid email is required.`);
    }

    if (!["employee", "manager", "admin"].includes(role)) {
      validationErrors.push(
        `Row ${rowNum}: role must be employee, manager, or admin.`,
      );
    }

    // ------------------------------------------------------
    // Duplicate Employee ID
    // ------------------------------------------------------

    if (employeeId) {
      if (seenEmployeeIds.has(employeeId)) {
        validationErrors.push(
          `Row ${rowNum}: Duplicate employeeId '${employeeId}' found in CSV.`,
        );
      }

      seenEmployeeIds.add(employeeId);
    }

    // ------------------------------------------------------
    // Duplicate Email
    // ------------------------------------------------------

    if (email) {
      if (seenEmails.has(email)) {
        validationErrors.push(
          `Row ${rowNum}: Duplicate email '${email}' found in CSV.`,
        );
      }

      seenEmails.add(email);
    }

    // ======================================================
    // LEAVE BALANCE VALIDATION
    // ORDER:
    // LWP
    // Casual
    // Paid
    // Sick
    // COFF
    // Optional Holiday
    // Paternity
    // Maternity
    // Bereavement
    // ======================================================

    const balanceFields = [
      "lwp",
      "casualLeave",
      "paidLeave",
      "sickLeave",
      "coffBalance",
      "optionalHoliday",
      "paternityLeave",
      "maternityLeave",
      "bereavementLeave",
    ];

    balanceFields.forEach((field) => {
      const value = row[field];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        const numberValue = Number(value);

        if (!Number.isFinite(numberValue) || numberValue < 0) {
          validationErrors.push(
            `Row ${rowNum}: ${field} must be a valid number >= 0.`,
          );
        }
      }
    });
  });

  // ========================================================
  // STOP IF VALIDATION FAILED
  // ========================================================

  if (validationErrors.length > 0) {
    throw new ApiError(400, `Validation failed: ${validationErrors.join(" ")}`);
  }

  // ========================================================
  // 5. EXISTING USERS
  // ========================================================

  const employeeIds = Array.from(seenEmployeeIds);
  const emails = Array.from(seenEmails);

  const existingUsers = await User.find({
    $or: [
      {
        employeeId: {
          $in: employeeIds,
        },
      },
      {
        email: {
          $in: emails,
        },
      },
    ],
  }).select("_id employeeId email role");

  const existingByEmpId = new Map();
  const existingByEmail = new Map();

  existingUsers.forEach((user) => {
    if (user.employeeId) {
      existingByEmpId.set(user.employeeId.toUpperCase(), user);
    }

    if (user.email) {
      existingByEmail.set(user.email.toLowerCase(), user);
    }
  });

  // ========================================================
  // 6. EMAIL CONFLICT CHECK
  // ========================================================

  validRows.forEach((row, index) => {
    const rowNum = index + 2;

    const employeeId = row.employeeId.trim().toUpperCase();

    const email = row.email.trim().toLowerCase();

    const emailUser = existingByEmail.get(email);

    if (emailUser && emailUser.employeeId?.toUpperCase() !== employeeId) {
      validationErrors.push(
        `Row ${rowNum}: Email '${email}' belongs to another employee (${emailUser.employeeId}).`,
      );
    }
  });

  // ========================================================
  // 7. MANAGER MAPPING
  // ========================================================

  const managerRefs = validRows
    .map((row) => row.reportingManagerEmployeeId?.trim()?.toUpperCase())
    .filter(Boolean);

  const managerUsers = managerRefs.length
    ? await User.find({
        employeeId: {
          $in: managerRefs,
        },
      }).select("_id employeeId role")
    : [];

  const managerIdMap = new Map();

  managerUsers.forEach((manager) => {
    managerIdMap.set(manager.employeeId.toUpperCase(), manager._id);
  });

  // --------------------------------------------------------
  // Managers contained inside the same CSV
  // --------------------------------------------------------

  validRows.forEach((row) => {
    const role = row.role?.trim()?.toLowerCase();

    if (["manager", "admin"].includes(role)) {
      const employeeId = row.employeeId?.trim()?.toUpperCase();

      if (employeeId && !managerIdMap.has(employeeId)) {
        managerIdMap.set(employeeId, "PENDING_RESOLVE");
      }
    }
  });

  // --------------------------------------------------------
  // Validate manager references
  // --------------------------------------------------------

  validRows.forEach((row, index) => {
    const rowNum = index + 2;

    const managerRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();

    if (managerRef && !managerIdMap.has(managerRef)) {
      validationErrors.push(
        `Row ${rowNum}: Manager ID '${managerRef}' does not exist.`,
      );
    }
  });

  if (validationErrors.length > 0) {
    throw new ApiError(400, `Import rejected: ${validationErrors.join(" ")}`);
  }

  // ========================================================
  // 8. INSERT / UPDATE
  // ========================================================

  let insertedCount = 0;
  let updatedCount = 0;

  const emailsToDispatch = [];

  for (const row of validRows) {
    const employeeId = row.employeeId.trim().toUpperCase();

    const name = row.name.trim();

    const email = row.email.trim().toLowerCase();

    const role = row.role.trim().toLowerCase();

    const managerRef = row.reportingManagerEmployeeId?.trim()?.toUpperCase();

    // ------------------------------------------------------
    // Resolve reporting manager
    // ------------------------------------------------------

    let reportingManager = null;

    if (managerRef) {
      const resolved = managerIdMap.get(managerRef);

      if (resolved && resolved !== "PENDING_RESOLVE") {
        reportingManager = resolved;
      } else {
        const manager = await User.findOne({
          employeeId: managerRef,
        }).select("_id");

        if (manager) {
          reportingManager = manager._id;
        }
      }
    }

    // ======================================================
    // LEAVE BALANCE
    // ======================================================

    const leaveBalance = buildLeaveBalance({
      lwp: row.lwp,

      casualLeave: row.casualLeave,

      paidLeave: row.paidLeave,

      sickLeave: row.sickLeave,

      coffBalance: row.coffBalance,

      optionalHoliday: row.optionalHoliday,

      paternityLeave: row.paternityLeave,

      maternityLeave: row.maternityLeave,

      bereavementLeave: row.bereavementLeave,
    });

    // ======================================================
    // EXISTING EMPLOYEE
    // ======================================================

    const existingUser = existingByEmpId.get(employeeId);

    if (existingUser) {
      existingUser.name = name;

      existingUser.email = email;

      existingUser.role = role;

      if (reportingManager) {
        existingUser.reportingManager = reportingManager;
      }

      existingUser.leaveBalance = leaveBalance;

      await existingUser.save();

      updatedCount++;

      continue;
    }

    // ======================================================
    // NEW EMPLOYEE
    // ======================================================

    const rawPassword = crypto.randomBytes(5).toString("hex") + "!1A";

    // IMPORTANT:
    // If your User model DOES NOT have a pre-save
    // password hashing middleware, use hashedPassword.
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const created = await User.create({
      employeeId,

      name,

      email,

      // IMPORTANT:
      password: rawPassword,

      role,

      reportingManager,

      leaveBalance,
    });

    // Add newly created manager to map
    managerIdMap.set(employeeId, created._id);

    // ------------------------------------------------------
    // Email credentials
    // ------------------------------------------------------

    emailsToDispatch.push({
      name,

      email,

      password: rawPassword,

      role,
    });

    insertedCount++;
  }

  // ========================================================
  // 9. SEND CREDENTIAL EMAILS
  // ========================================================

  emailsToDispatch.forEach((item) => {
    sendCredentialsEmail(item).catch((err) => {
      console.error(`[Bulk Email Error] ${item.email}:`, err.message);
    });
  });

  // ========================================================
  // 10. RESPONSE
  // ========================================================

  return ApiResponse.send(
    res,
    200,
    {
      insertedCount,

      updatedCount,

      totalProcessed: validRows.length,
    },
    `Import successful: ${insertedCount} new users created, ${updatedCount} existing users updated.`,
  );
});

// Keep old import working
export const bulkImportStaffold = bulkImportStaff;

// ============================================================
// 4. UPDATE STAFF DETAILS
// ============================================================

export const updateStaffDetails = asyncHandler(async (req, res) => {
  const { employeeId, name, email, role } = req.body;

  if (!employeeId || !name || !email || !role) {
    throw new ApiError(400, "Employee ID, name, email and role are required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const normalizedRole = role.trim().toLowerCase();

  if (!["employee", "manager", "admin"].includes(normalizedRole)) {
    throw new ApiError(400, "Invalid role");
  }

  const existingEmail = await User.findOne({
    email: normalizedEmail,
    _id: {
      $ne: employeeId,
    },
  });

  if (existingEmail) {
    throw new ApiError(
      409,
      "Another user is already registered with this email address",
    );
  }

  // Prevent admin self-demotion
  if (req.user._id.toString() === employeeId && normalizedRole !== "admin") {
    throw new ApiError(400, "You cannot demote your own Admin account");
  }

  const updatedStaff = await User.findByIdAndUpdate(
    employeeId,
    {
      name: name.trim(),
      email: normalizedEmail,
      role: normalizedRole,
    },
    {
      new: true,
      runValidators: true,
    },
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

// ============================================================
// 5. TOGGLE STAFF STATUS
// ============================================================

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

// ============================================================
// 6. GET ALL STAFF
// ============================================================

export const getAllStaff = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const limit = Math.max(1, parseInt(req.query.limit) || 5);

  const skip = (page - 1) * limit;

  const [staff, total, managers] = await Promise.all([
    User.find()
      .populate("reportingManager", "name email role employeeId")
      .select("-password")
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit),

    User.countDocuments(),

    User.find({
      role: {
        $in: ["manager", "admin"],
      },
    }).select("name email role employeeId"),
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

// ============================================================
// 7. ASSIGN MANAGER
// ============================================================

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
    {
      reportingManager: managerId || null,
    },
    {
      new: true,
    },
  ).populate("reportingManager", "name email role employeeId");

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

// ============================================================
// 8. UPDATE LEAVE BALANCE / QUOTA
// Supports ALL 9 leave types
// ============================================================

export const updateLeaveBalance = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, amount } = req.body;

  // --------------------------------------------------------
  // Required fields
  // --------------------------------------------------------

  if (!employeeId) {
    throw new ApiError(400, "Employee ID is required");
  }

  if (!leaveType) {
    throw new ApiError(400, "Leave type is required");
  }

  // --------------------------------------------------------
  // Normalize + validate
  // --------------------------------------------------------

  const normalizedLeaveType = validateLeaveType(leaveType);

  // --------------------------------------------------------
  // Validate amount
  // --------------------------------------------------------

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new ApiError(
      400,
      "Leave balance must be a valid number greater than or equal to 0",
    );
  }

  // --------------------------------------------------------
  // Find employee
  // --------------------------------------------------------

  const employee = await User.findById(employeeId);

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  // --------------------------------------------------------
  // Update quota
  // --------------------------------------------------------

  if (!employee.leaveBalance) {
    employee.leaveBalance = {};
  }

  employee.leaveBalance[normalizedLeaveType] = numericAmount;

  await employee.save();

  // --------------------------------------------------------
  // Response
  // --------------------------------------------------------

  return ApiResponse.send(
    res,
    200,
    employee.toObject(),
    `${LEAVE_TYPE_LABELS[normalizedLeaveType]} balance updated successfully`,
  );
});

// Keep old import working
export const updateLeaveBalanceold = updateLeaveBalance;

// ============================================================
// 9. EXPORT ATTENDANCE REPORT
// ============================================================

export const exportAttendanceReport = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.query;

  const filter = {};

  if (employeeId && employeeId !== "all") {
    filter.userId = employeeId;
  }

  if (month && year) {
    const monthFormatted = String(month).padStart(2, "0");

    filter.date = {
      $regex: `^${year}-${monthFormatted}`,
    };
  } else if (year) {
    filter.date = {
      $regex: `^${year}-`,
    };
  }

  const records = await Attendance.find(filter)
    .populate("userId", "name email role employeeId")
    .sort({
      date: -1,
    });

  const headers = [
    "Employee ID",
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

  const rows = records.map((rec) => {
    const clockInFormatted = rec.clockIn
      ? new Date(rec.clockIn).toLocaleTimeString()
      : "N/A";

    const clockOutFormatted = rec.clockOut
      ? new Date(rec.clockOut).toLocaleTimeString()
      : "N/A";

    return [
      `"${rec.userId?.employeeId || "N/A"}"`,
      rec.date,
      `"${rec.userId?.name || "Deleted User"}"`,
      `"${rec.userId?.email || "N/A"}"`,
      rec.userId?.role || "N/A",
      `"${clockInFormatted}"`,
      `"${clockOutFormatted}"`,
      rec.totalHours || 0,
      rec.status || "N/A",
      `"${rec.ipAddress || "N/A"}"`,
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\r\n");

  const filename = `attendance_report_${employeeId || "all"}_${year || "all"}_${month || "all"}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  return res.status(200).send(csvContent);
});

// ============================================================
// 10. HR ADMIN LEAVE HISTORY
// Supports ALL 9 leave types
// ============================================================

export const getLeaveHistoryReport = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.query;

  const page = Math.max(1, parseInt(req.query.page) || 1);

  const limit = Math.max(1, parseInt(req.query.limit) || 10);

  const skip = (page - 1) * limit;

  // --------------------------------------------------------
  // Approved leaves only
  // --------------------------------------------------------

  const filter = {
    status: "approved",
  };

  // --------------------------------------------------------
  // Employee
  // --------------------------------------------------------

  if (employeeId && employeeId !== "all") {
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      throw new ApiError(400, "Invalid employee ID");
    }

    filter.userId = new mongoose.Types.ObjectId(employeeId);
  }

  // --------------------------------------------------------
  // Month / Year filter
  // --------------------------------------------------------

  if (year) {
    const yr = parseInt(year);

    if (!Number.isFinite(yr)) {
      throw new ApiError(400, "Invalid year");
    }

    if (month) {
      const monthNumber = parseInt(month);

      if (monthNumber < 1 || monthNumber > 12) {
        throw new ApiError(400, "Invalid month");
      }

      const monthIndex = monthNumber - 1;

      const startRange = new Date(Date.UTC(yr, monthIndex, 1, 0, 0, 0, 0));

      const endRange = new Date(Date.UTC(yr, monthIndex + 1, 1, 0, 0, 0, 0));

      // ----------------------------------------------------
      // IMPORTANT:
      // Find leaves overlapping selected month.
      // This also handles leaves crossing month boundary.
      // ----------------------------------------------------

      filter.startDate = {
        $lt: endRange,
      };

      filter.endDate = {
        $gte: startRange,
      };
    } else {
      const startRange = new Date(Date.UTC(yr, 0, 1, 0, 0, 0, 0));

      const endRange = new Date(Date.UTC(yr + 1, 0, 1, 0, 0, 0, 0));

      filter.startDate = {
        $lt: endRange,
      };

      filter.endDate = {
        $gte: startRange,
      };
    }
  }

  // --------------------------------------------------------
  // Get records
  // --------------------------------------------------------

  const [records, total] = await Promise.all([
    Leave.find(filter)
      .populate("userId", "name email employeeId role")
      .populate("reviewedBy", "name email")
      .sort({
        startDate: -1,
      })
      .skip(skip)
      .limit(limit),

    Leave.countDocuments(filter),
  ]);

  // --------------------------------------------------------
  // Aggregate leave usage
  //
  // IMPORTANT:
  // Do NOT restrict this to only PL/CL/SL/OH.
  // MongoDB will automatically group COFF,
  // Paternity, Maternity, Bereavement and LWP.
  // --------------------------------------------------------

  const summaryAggregate = await Leave.aggregate([
    {
      $match: filter,
    },

    {
      $group: {
        _id: "$leaveType",

        totalDays: {
          $sum: "$daysCount",
        },
      },
    },
  ]);

  // --------------------------------------------------------
  // Complete summary
  // --------------------------------------------------------

  const summary = {
    total: 0,

    paid: 0,

    casual: 0,

    sick: 0,

    oh: 0,

    coff: 0,

    paternity: 0,

    maternity: 0,

    bereavement: 0,

    lwp: 0,
  };

  // --------------------------------------------------------
  // Populate all 9 leave types
  // --------------------------------------------------------

  summaryAggregate.forEach((item) => {
    const leaveType = item._id;

    const totalDays = Number(item.totalDays || 0);

    if (Object.prototype.hasOwnProperty.call(summary, leaveType)) {
      summary[leaveType] = totalDays;
    }

    summary.total += totalDays;
  });

  // --------------------------------------------------------
  // Response
  // --------------------------------------------------------

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

// Keep old import working
export const getLeaveHistoryReportold = getLeaveHistoryReport;

// ============================================================
// 11. YEAR END ROLLOVER
// ============================================================

export const triggerYearEndRollover = asyncHandler(async (req, res) => {
  const staffUsers = await User.find({
    isActive: true,
  });

  let processedCount = 0;

  const auditDetails = [];

  for (const user of staffUsers) {
    const prevCasual = Number(user.leaveBalance?.casual || 0);

    const prevOH = Number(user.leaveBalance?.oh || 0);

    const prevPaid = Number(user.leaveBalance?.paid || 0);

    // Convert OH to Paid
    const addedToPaid = prevOH > 0 ? prevOH : 0;

    const newPaid = prevPaid + addedToPaid;

    // Reset CL
    user.leaveBalance.casual = 0;

    // New paid
    user.leaveBalance.paid = newPaid;

    // New OH
    user.leaveBalance.oh = 2;

    // Ensure all new fields
    if (user.leaveBalance.coff === undefined) {
      user.leaveBalance.coff = 0;
    }

    if (user.leaveBalance.paternity === undefined) {
      user.leaveBalance.paternity = 0;
    }

    if (user.leaveBalance.maternity === undefined) {
      user.leaveBalance.maternity = 0;
    }

    if (user.leaveBalance.bereavement === undefined) {
      user.leaveBalance.bereavement = 0;
    }

    if (user.leaveBalance.lwp === undefined) {
      user.leaveBalance.lwp = 0;
    }

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
    {
      processedCount,

      auditDetails,
    },

    `Year-end rollover complete: Processed ${processedCount} accounts. CL reset to 0, unused OH converted to Paid Leave.`,
  );
});

// ============================================================
// 12. DIRECT MARK ATTENDANCE
// ============================================================

export const directMarkAttendance = asyncHandler(async (req, res) => {
  const { employeeId, date, startTime, endTime, remarks } = req.body;

  if (!employeeId || !date || !startTime || !endTime) {
    throw new ApiError(
      400,
      "Employee, Date, Clock In, and Clock Out times are required",
    );
  }

  const user = await User.findById(employeeId);

  if (!user) {
    throw new ApiError(404, "Employee not found");
  }

  const clockIn = new Date(`${date}T${startTime}:00`);

  const clockOut = new Date(`${date}T${endTime}:00`);

  if (Number.isNaN(clockIn.getTime()) || Number.isNaN(clockOut.getTime())) {
    throw new ApiError(400, "Invalid attendance date or time");
  }

  if (clockOut <= clockIn) {
    throw new ApiError(400, "Clock Out time must be after Clock In time");
  }

  const diffMs = clockOut.getTime() - clockIn.getTime();

  const totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

  const activeMinutes = Math.round(totalHours * 60);

  let status = "absent";

  if (totalHours >= 9) {
    status = "present";
  } else if (totalHours >= 7) {
    status = "short-leave";
  } else if (totalHours >= 5) {
    status = "half-day";
  }

  const attendance = await Attendance.findOneAndUpdate(
    {
      userId: user._id,
      date,
    },

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

    {
      upsert: true,

      new: true,

      setDefaultsOnInsert: true,
    },
  );

  return ApiResponse.send(
    res,
    200,
    attendance,
    "Attendance marked successfully by Admin",
  );
});

// ============================================================
// HR ADMIN - TODAY'S EMPLOYEE ATTENDANCE
// ============================================================

export const getTodayEmployeeAttendance = asyncHandler(async (req, res) => {
  /*
   * IMPORTANT:
   * Attendance.date is stored as YYYY-MM-DD string.
   * Therefore we must query it as a string, NOT as a Date object.
   */

  const now = new Date();

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;

  // ------------------------------------------------------------
  // Get all active employees + managers
  // ------------------------------------------------------------

  const employees = await User.find({
    role: {
      $in: ["employee", "manager", "admin"],
    },
    isActive: {
      $ne: false,
    },
  })
    .select("_id employeeId name email role")
    .sort({
      name: 1,
    })
    .lean();

  // ------------------------------------------------------------
  // Get today's attendance
  // ------------------------------------------------------------

  const attendanceRecords = await Attendance.find({
    date: today,
    userId: {
      $in: employees.map((employee) => employee._id),
    },
  })
    .sort({
      clockIn: 1,
    })
    .lean();

  // ------------------------------------------------------------
  // Create lookup map
  // ------------------------------------------------------------

  const attendanceMap = new Map();

  attendanceRecords.forEach((attendance) => {
    attendanceMap.set(String(attendance.userId), attendance);
  });

  // ------------------------------------------------------------
  // Build employee list
  // ------------------------------------------------------------

  const result = employees.map((employee) => {
    const attendance = attendanceMap.get(String(employee._id));

    let status = "Not Punched";

    if (attendance?.clockIn && !attendance?.clockOut) {
      status = "In Process";
    } else if (attendance?.clockIn && attendance?.clockOut) {
      status = "Completed";
    }

    return {
      userId: employee._id,

      employeeId: employee.employeeId,

      employeeName: employee.name,

      employeeEmail: employee.email,

      role: employee.role,

      punchIn: attendance?.clockIn || null,

      punchOut: attendance?.clockOut || null,

      totalHours: attendance?.totalHours || 0,

      activeMinutes: attendance?.activeMinutes || 0,

      attendanceStatus: attendance?.status || null,

      status,

      attendanceId: attendance?._id || null,
    };
  });

  // ------------------------------------------------------------
  // Response
  // ------------------------------------------------------------

  return ApiResponse.send(
    res,
    200,
    {
      date: today,

      employees: result,

      total: result.length,
    },
    "Today's employee attendance retrieved successfully",
  );
});

// ============================================================
// HR ADMIN - EMPLOYEE ATTENDANCE HISTORY
// ============================================================

export const getEmployeeAttendanceHistory = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.query;

  if (!employeeId) {
    throw new ApiError(400, "Employee ID is required");
  }

  // ----------------------------------------------------------
  // Find employee
  // ----------------------------------------------------------

  const employee = await User.findById(employeeId)
    .select("_id employeeId name email role isActive")
    .lean();

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  // ----------------------------------------------------------
  // Build query
  // ----------------------------------------------------------

  const query = {
    userId: employee._id,
  };

  // ----------------------------------------------------------
  // Month + Year filter
  // ----------------------------------------------------------

  if (month && year) {
    const formattedMonth = String(month).padStart(2, "0");

    query.date = {
      $regex: `^${year}-${formattedMonth}-`,
    };
  } else if (year) {
    query.date = {
      $regex: `^${year}-`,
    };
  }

  // ----------------------------------------------------------
  // Fetch records
  // ----------------------------------------------------------

  const records = await Attendance.find(query)
    .sort({
      date: 1,
    })
    .lean();

  // ----------------------------------------------------------
  // Response
  // ----------------------------------------------------------

  return ApiResponse.send(
    res,
    200,
    {
      employee: {
        _id: employee._id,
        employeeId: employee.employeeId,
        name: employee.name,
        email: employee.email,
        role: employee.role,
      },

      records,

      month: month ? Number(month) : null,

      year: year ? Number(year) : null,
    },
    "Employee attendance history retrieved successfully",
  );
});

// Grant / Credit leave days to all active employees
export const grantLeaveToAll91026 = asyncHandler(async (req, res) => {
  const { leaveType, amount, reason } = req.body;

  if (!leaveType) {
    throw new ApiError(400, "Leave type is required");
  }

  const daysToAdd = Number(amount);
  if (isNaN(daysToAdd) || daysToAdd <= 0) {
    throw new ApiError(
      400,
      "Please enter a valid positive number of days to credit",
    );
  }

  // Update leave balance for all active employees and managers
  const updateField = `leaveBalance.${leaveType}`;
  const result = await User.updateMany(
    { isActive: { $ne: false } },
    { $inc: { [updateField]: daysToAdd } },
  );

  return ApiResponse.send(
    res,
    200,
    { modifiedCount: result.modifiedCount },
    `Successfully credited ${daysToAdd} day(s) of ${leaveType.toUpperCase()} Leave to ${result.modifiedCount} active staff member(s).`,
  );
});

export const exportLeaveHistoryReportold = asyncHandler(async (req, res) => {
  const { employeeId, month, year, allMonths } = req.query;

  // --------------------------------------------------
  // Year
  // --------------------------------------------------
  const targetYear = Number(year) || new Date().getFullYear();

  // --------------------------------------------------
  // Base query
  // --------------------------------------------------
  const query = {
    status: "approved",
  };

  // --------------------------------------------------
  // Filter by employee
  // --------------------------------------------------
  if (employeeId && employeeId !== "all") {
    query.userId = employeeId;
  }

  // --------------------------------------------------
  // Filter by month / full year
  // --------------------------------------------------
  if (allMonths !== "true" && month) {
    const m = Number(month);

    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new ApiError(400, "Invalid month");
    }

    const startDate = new Date(targetYear, m - 1, 1, 0, 0, 0, 0);

    const endDate = new Date(targetYear, m, 0, 23, 59, 59, 999);

    query.startDate = {
      $gte: startDate,
      $lte: endDate,
    };
  } else {
    // Full year
    const startDate = new Date(targetYear, 0, 1, 0, 0, 0, 0);

    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    query.startDate = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  // --------------------------------------------------
  // Fetch approved leaves
  // --------------------------------------------------
  const leaves = await Leave.find(query)
    .populate("userId", "employeeId name email")
    .populate("reviewedBy", "name")
    .sort({
      startDate: 1,
    });

  // --------------------------------------------------
  // CSV headers
  // --------------------------------------------------
  const csvHeaders = [
    "Emp ID",
    "Employee Name",
    "Email",
    "LWP",
    "CL",
    "PL",
    "SL",
    "COFF",
    "OH",
    "Paternity",
    "Maternity",
    "Bereavement",
    "Total Leaves Taken",
  ];

  // --------------------------------------------------
  // Employee aggregation
  // --------------------------------------------------
  const employeeMap = {};

  leaves.forEach((leave) => {
    const user = leave.userId;

    if (!user) {
      return;
    }

    const uid = user._id.toString();

    // Create employee record
    if (!employeeMap[uid]) {
      employeeMap[uid] = {
        employeeId: user.employeeId || "N/A",
        name: user.name || "Unknown",
        email: user.email || "",

        lwp: 0,
        cl: 0,
        pl: 0,
        sl: 0,
        coff: 0,
        oh: 0,
        paternity: 0,
        maternity: 0,
        bereavement: 0,

        total: 0,
      };
    }

    // ------------------------------------------------
    // Leave days
    // ------------------------------------------------
    const days = Number(leave.daysCount ?? leave.days ?? 1);

    const validDays = Number.isFinite(days) && days > 0 ? days : 1;

    // ------------------------------------------------
    // Normalize leave type
    // ------------------------------------------------
    const rawType = String(leave.leaveType || "")
      .trim()
      .toLowerCase();

    // ------------------------------------------------
    // Convert possible leave names to CSV fields
    // ------------------------------------------------
    const leaveTypeMap = {
      // Paid Leave
      pl: "pl",
      paid: "pl",
      paid_leave: "pl",
      paidleave: "pl",

      // Casual Leave
      cl: "cl",
      casual: "cl",
      casual_leave: "cl",
      casualleave: "cl",

      // Sick Leave
      sl: "sl",
      sick: "sl",
      sick_leave: "sl",
      sickleave: "sl",

      // Compensatory Off
      coff: "coff",
      compensatory: "coff",
      compensatory_off: "coff",
      compensatoryoff: "coff",

      // Optional Holiday
      oh: "oh",
      optional: "oh",
      optional_holiday: "oh",
      optionalholiday: "oh",

      // Paternity
      pat: "paternity",
      paternity: "paternity",
      paternity_leave: "paternity",
      paternityleave: "paternity",

      // Maternity
      mat: "maternity",
      maternity: "maternity",
      maternity_leave: "maternity",
      maternityleave: "maternity",

      // Bereavement
      brv: "bereavement",
      bereavement: "bereavement",
      bereavement_leave: "bereavement",
      bereavementleave: "bereavement",

      // Leave Without Pay
      lwp: "lwp",
      unpaid: "lwp",
      unpaid_leave: "lwp",
      unpaidleave: "lwp",
      leave_without_pay: "lwp",
      leavewithoutpay: "lwp",
    };

    const field = leaveTypeMap[rawType];

    // ------------------------------------------------
    // Add leave days to appropriate category
    // ------------------------------------------------
    if (field && employeeMap[uid][field] !== undefined) {
      employeeMap[uid][field] += validDays;
    }

    // ------------------------------------------------
    // Total leaves
    // ------------------------------------------------
    employeeMap[uid].total += validDays;
  });

  // --------------------------------------------------
  // CSV rows
  // --------------------------------------------------
  const csvRows = [];

  // Header
  csvRows.push(csvHeaders.join(","));

  // Data
  Object.values(employeeMap).forEach((emp) => {
    const row = [
      `"${String(emp.employeeId).replace(/"/g, '""')}"`,
      `"${String(emp.name).replace(/"/g, '""')}"`,
      `"${String(emp.email).replace(/"/g, '""')}"`,

      emp.lwp,
      emp.cl,
      emp.pl,
      emp.sl,
      emp.coff,
      emp.oh,
      emp.paternity,
      emp.maternity,
      emp.bereavement,

      emp.total,
    ];

    csvRows.push(row.join(","));
  });

  // --------------------------------------------------
  // Generate CSV
  // --------------------------------------------------
  const csvString = csvRows.join("\n");

  // --------------------------------------------------
  // Response headers
  // --------------------------------------------------
  res.setHeader("Content-Type", "text/csv; charset=utf-8");

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="Leave_History_Report_${targetYear}.csv"`,
  );

  // UTF-8 BOM for Excel
  const csvWithBom = "\uFEFF" + csvString;

  return res.status(200).send(csvWithBom);
});

export const exportLeaveHistoryReport = asyncHandler(async (req, res) => {
  const { employeeId, month, year, allMonths } = req.query;

  // ============================================================
  // YEAR
  // ============================================================

  const targetYear = Number(year) || new Date().getFullYear();

  // ============================================================
  // LEAVE QUERY
  // ============================================================

  const leaveQuery = {
    status: "approved",
  };

  // ============================================================
  // DATE FILTER
  // ============================================================

  if (allMonths !== "true" && month) {
    const m = Number(month);

    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new ApiError(400, "Invalid month");
    }

    const startDate = new Date(targetYear, m - 1, 1, 0, 0, 0, 0);

    const endDate = new Date(targetYear, m, 0, 23, 59, 59, 999);

    leaveQuery.startDate = {
      $gte: startDate,
      $lte: endDate,
    };
  } else {
    // ==========================================================
    // FULL YEAR
    // ==========================================================

    const startDate = new Date(targetYear, 0, 1, 0, 0, 0, 0);

    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    leaveQuery.startDate = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  // ============================================================
  // EMPLOYEE QUERY
  // ============================================================
  //
  // IMPORTANT:
  //
  // We fetch employees FIRST.
  //
  // This ensures employees who have taken ZERO leaves
  // are also included in the report.
  //
  // ============================================================

  const employeeQuery = {};

  // ------------------------------------------------------------
  // Specific employee
  // ------------------------------------------------------------

  if (employeeId && employeeId !== "all") {
    employeeQuery._id = employeeId;
  }

  // ------------------------------------------------------------
  // All Staff Members
  // ------------------------------------------------------------
  //
  // Only active employees.
  //
  // If you want inactive employees also, remove this line.
  // ------------------------------------------------------------

  employeeQuery.isActive = true;

  // ============================================================
  // FETCH EMPLOYEES
  // ============================================================

  const employees = await User.find(employeeQuery)
    .select("_id employeeId name email")
    .sort({
      name: 1,
    })
    .lean();

  // ============================================================
  // FETCH APPROVED LEAVES
  // ============================================================

  const leaves = await Leave.find(leaveQuery)
    .populate("userId", "employeeId name email")
    .populate("reviewedBy", "name")
    .sort({
      startDate: 1,
    })
    .lean();

  // ============================================================
  // LEAVE TYPE MAP
  // ============================================================

  const leaveTypeMap = {
    // ----------------------------------------------------------
    // PL - Paid Leave
    // ----------------------------------------------------------

    pl: "pl",
    paid: "pl",
    paid_leave: "pl",
    paidleave: "pl",

    // ----------------------------------------------------------
    // CL - Casual Leave
    // ----------------------------------------------------------

    cl: "cl",
    casual: "cl",
    casual_leave: "cl",
    casualleave: "cl",

    // ----------------------------------------------------------
    // SL - Sick Leave
    // ----------------------------------------------------------

    sl: "sl",
    sick: "sl",
    sick_leave: "sl",
    sickleave: "sl",

    // ----------------------------------------------------------
    // COFF - Compensatory Off
    // ----------------------------------------------------------

    coff: "coff",
    compensatory: "coff",
    compensatory_off: "coff",
    compensatoryoff: "coff",

    // ----------------------------------------------------------
    // OH - Optional Holiday
    // ----------------------------------------------------------

    oh: "oh",
    optional: "oh",
    optional_holiday: "oh",
    optionalholiday: "oh",

    // ----------------------------------------------------------
    // Paternity
    // ----------------------------------------------------------

    pat: "paternity",
    paternity: "paternity",
    paternity_leave: "paternity",
    paternityleave: "paternity",

    // ----------------------------------------------------------
    // Maternity
    // ----------------------------------------------------------

    mat: "maternity",
    maternity: "maternity",
    maternity_leave: "maternity",
    maternityleave: "maternity",

    // ----------------------------------------------------------
    // Bereavement
    // ----------------------------------------------------------

    brv: "bereavement",
    bereavement: "bereavement",
    bereavement_leave: "bereavement",
    bereavementleave: "bereavement",

    // ----------------------------------------------------------
    // LWP - Leave Without Pay
    // ----------------------------------------------------------

    lwp: "lwp",
    unpaid: "lwp",
    unpaid_leave: "lwp",
    unpaidleave: "lwp",
    leave_without_pay: "lwp",
    leavewithoutpay: "lwp",
  };

  // ============================================================
  // EMPLOYEE MAP
  // ============================================================
  //
  // Every employee gets a record here.
  //
  // Therefore employees with ZERO leaves will have:
  //
  // PL = 0
  // CL = 0
  // SL = 0
  // etc.
  //
  // ============================================================

  const employeeMap = {};

  // ============================================================
  // CREATE RECORD FOR EVERY EMPLOYEE
  // ============================================================

  employees.forEach((user) => {
    const uid = user._id.toString();

    employeeMap[uid] = {
      employeeId: user.employeeId || "N/A",

      name: user.name || "Unknown",

      email: user.email || "",

      // Leave counters
      lwp: 0,
      cl: 0,
      pl: 0,
      sl: 0,
      coff: 0,
      oh: 0,
      paternity: 0,
      maternity: 0,
      bereavement: 0,

      // Total
      total: 0,
    };
  });

  // ============================================================
  // PROCESS LEAVE RECORDS
  // ============================================================

  leaves.forEach((leave) => {
    const user = leave.userId;

    if (!user) {
      return;
    }

    const uid = user._id.toString();

    // ==========================================================
    // SAFETY CHECK
    // ==========================================================
    //
    // In case a leave belongs to an employee who is not present
    // in the current employee query.
    //
    // ==========================================================

    if (!employeeMap[uid]) {
      employeeMap[uid] = {
        employeeId: user.employeeId || "N/A",

        name: user.name || "Unknown",

        email: user.email || "",

        lwp: 0,
        cl: 0,
        pl: 0,
        sl: 0,
        coff: 0,
        oh: 0,
        paternity: 0,
        maternity: 0,
        bereavement: 0,

        total: 0,
      };
    }

    // ==========================================================
    // LEAVE DAYS
    // ==========================================================

    const days = Number(leave.daysCount ?? leave.days ?? 1);

    const validDays = Number.isFinite(days) && days > 0 ? days : 1;

    // ==========================================================
    // NORMALIZE LEAVE TYPE
    // ==========================================================

    const rawType = String(leave.leaveType || "")
      .trim()
      .toLowerCase();

    // ==========================================================
    // FIND CSV FIELD
    // ==========================================================

    const field = leaveTypeMap[rawType];

    // ==========================================================
    // ADD DAYS
    // ==========================================================

    if (field && employeeMap[uid][field] !== undefined) {
      employeeMap[uid][field] += validDays;
    }

    // ==========================================================
    // TOTAL LEAVE DAYS
    // ==========================================================

    employeeMap[uid].total += validDays;
  });

  // ============================================================
  // CSV HEADERS
  // ============================================================

  const csvHeaders = [
    "Emp ID",
    "Employee Name",
    "Email",

    "LWP",
    "CL",
    "PL",
    "SL",
    "COFF",
    "OH",

    "Paternity",
    "Maternity",
    "Bereavement",

    "Total Leaves Taken",

    "Leave Status",
  ];

  // ============================================================
  // CSV ESCAPE FUNCTION
  // ============================================================

  const escapeCsv = (value) => {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  };

  // ============================================================
  // CSV ROWS
  // ============================================================

  const csvRows = [];

  // ------------------------------------------------------------
  // HEADER
  // ------------------------------------------------------------

  csvRows.push(csvHeaders.join(","));

  // ============================================================
  // EMPLOYEE DATA
  // ============================================================

  Object.values(employeeMap).forEach((emp) => {
    // ----------------------------------------------------------
    // Leave Status
    // ----------------------------------------------------------

    const leaveStatus = emp.total > 0 ? "Leave Taken" : "No Leave";

    // ----------------------------------------------------------
    // CSV Row
    // ----------------------------------------------------------

    const row = [
      escapeCsv(emp.employeeId),

      escapeCsv(emp.name),

      escapeCsv(emp.email),

      // LWP
      emp.lwp,

      // CL
      emp.cl,

      // PL
      emp.pl,

      // SL
      emp.sl,

      // COFF
      emp.coff,

      // OH
      emp.oh,

      // Paternity
      emp.paternity,

      // Maternity
      emp.maternity,

      // Bereavement
      emp.bereavement,

      // Total
      emp.total,

      // Status
      escapeCsv(leaveStatus),
    ];

    csvRows.push(row.join(","));
  });

  // ============================================================
  // GENERATE CSV
  // ============================================================

  const csvString = csvRows.join("\n");

  // ============================================================
  // RESPONSE HEADERS
  // ============================================================

  res.setHeader("Content-Type", "text/csv; charset=utf-8");

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="Leave_History_Report_${targetYear}.csv"`,
  );

  // ============================================================
  // UTF-8 BOM
  // ============================================================
  //
  // This helps Microsoft Excel correctly display
  // employee names containing special characters.
  //
  // ============================================================

  const csvWithBom = "\uFEFF" + csvString;

  return res.status(200).send(csvWithBom);
});

export const resetEmployeePassword = asyncHandler(async (req, res) => {
  const { employeeId } = req.body; // or req.params depending on your preference

  if (!employeeId) {
    throw new ApiError(400, "Employee ID is required");
  }

  const user = await User.findById(employeeId);
  if (!user) {
    throw new ApiError(404, "Employee record not found");
  }

  // Generate a secure random 8-character temporary password
  const tempPassword =
    crypto.randomBytes(4).toString("hex").toUpperCase() + "@1";

  // Hash the new password before saving
  // const salt = await bcrypt.genSalt(10);
  // user.password = await bcrypt.hash(tempPassword, salt);

  user.password = tempPassword;
  await user.save();

  // Send the new credentials via email
  await sendEmailWithPassword({
    name: user.name,
    email: user.email,
    randomPassword: tempPassword,
  });

  return ApiResponse.send(
    res,
    200,
    null,
    `Password successfully reset and emailed to (${user.email}).`,
  );
});

export const grantLeaveToAll = asyncHandler(async (req, res) => {
  const { leaveType, amount, userId, targetType } = req.body;

  if (!leaveType) {
    throw new ApiError(400, "Leave type is required");
  }

  // Use parseFloat instead of parseInt to support 0.5, 1.5, etc.
  const daysToAdd = parseFloat(amount);
  if (isNaN(daysToAdd) || daysToAdd <= 0) {
    throw new ApiError(
      400,
      "Please enter a valid positive number of days to credit",
    );
  }

  const updateField = `leaveBalance.${leaveType}`;
  let message = "";

  if (targetType === "individual" && userId) {
    // Credit to single employee
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { [updateField]: daysToAdd } },
      { new: true },
    );
    if (!updatedUser) {
      throw new ApiError(404, "Target employee not found");
    }
    message = `Successfully credited ${daysToAdd} day(s) of ${leaveType.toUpperCase()} Leave to ${updatedUser.name}.`;
  } else {
    // Credit to all active employees
    const result = await User.updateMany(
      { isActive: { $ne: false } },
      { $inc: { [updateField]: daysToAdd } },
    );
    message = `Successfully credited ${daysToAdd} day(s) of ${leaveType.toUpperCase()} Leave to ${result.modifiedCount} active staff member(s).`;
  }

  return ApiResponse.send(res, 200, null, message);
});
