import Holiday from "../models/Holiday.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { parse } from "csv-parse/sync";

/*
|--------------------------------------------------------------------------
| Get Official Holidays
|--------------------------------------------------------------------------
|
| Supports:
|
| GET /api/holidays
| GET /api/holidays?year=2026
| GET /api/holidays?page=1&limit=10
| GET /api/holidays?year=2026&page=1&limit=10
|
| For attendance sheet:
|
| GET /api/holidays?year=2026&all=true
|
|--------------------------------------------------------------------------
*/

export const getHolidays = asyncHandler(async (req, res) => {
  const { year, page = 1, limit = 10, all = "false" } = req.query;

  const query = { tenantId: req.tenantId };

  /*
  |--------------------------------------------------------------------------
  | Year Filter
  |--------------------------------------------------------------------------
  */

  if (year) {
    query.date = {
      $regex: `^${String(year)}`,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Return All
  |--------------------------------------------------------------------------
  |
  | Useful for employee attendance sheet.
  |
  */

  if (String(all).toLowerCase() === "true") {
    const holidays = await Holiday.find(query).sort({ date: 1 });

    return ApiResponse.send(
      res,
      200,
      {
        holidays,
        pagination: {
          total: holidays.length,
          page: 1,
          limit: holidays.length,
          totalPages: holidays.length > 0 ? 1 : 0,
        },
      },
      "Holidays fetched successfully",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Pagination
  |--------------------------------------------------------------------------
  */

  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const skip = (currentPage - 1) * perPage;

  const [holidays, total] = await Promise.all([
    Holiday.find(query).sort({ date: 1 }).skip(skip).limit(perPage),

    Holiday.countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return ApiResponse.send(
    res,
    200,
    {
      holidays,
      pagination: {
        total,
        page: currentPage,
        limit: perPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    },
    "Holidays fetched successfully",
  );
});

/*
|--------------------------------------------------------------------------
| Create Official Holiday
|--------------------------------------------------------------------------
*/

export const createHoliday = asyncHandler(async (req, res) => {
  const { date, title, description = "" } = req.body;

  /*
  |--------------------------------------------------------------------------
  | Required Fields
  |--------------------------------------------------------------------------
  */

  if (!date) {
    throw new ApiError(400, "Holiday date is required");
  }

  if (!title || !title.trim()) {
    throw new ApiError(400, "Holiday title is required");
  }

  /*
  |--------------------------------------------------------------------------
  | Date Format Validation
  |--------------------------------------------------------------------------
  */

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateRegex.test(date)) {
    throw new ApiError(400, "Holiday date must be in YYYY-MM-DD format");
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Actual Date
  |--------------------------------------------------------------------------
  */

  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "Invalid holiday date");
  }

  /*
  |--------------------------------------------------------------------------
  | Duplicate Check
  |--------------------------------------------------------------------------
  */

  const existing = await Holiday.findOne({
    tenantId: req.tenantId,
    date,
  });

  if (existing) {
    throw new ApiError(400, "A holiday is already registered for this date");
  }

  /*
  |--------------------------------------------------------------------------
  | Create
  |--------------------------------------------------------------------------
  */

  const holiday = await Holiday.create({
    tenantId: req.tenantId,
    date,
    title: title.trim(),
    description: description?.trim() || "",
  });

  return ApiResponse.send(
    res,
    201,
    holiday,
    "Official holiday added successfully",
  );
});

/*
|--------------------------------------------------------------------------
| Update Official Holiday
|--------------------------------------------------------------------------
*/

export const updateHoliday = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { date, title, description = "" } = req.body;

  /*
  |--------------------------------------------------------------------------
  | Required Fields
  |--------------------------------------------------------------------------
  */

  if (!date) {
    throw new ApiError(400, "Holiday date is required");
  }

  if (!title || !title.trim()) {
    throw new ApiError(400, "Holiday title is required");
  }

  /*
  |--------------------------------------------------------------------------
  | Date Format
  |--------------------------------------------------------------------------
  */

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateRegex.test(date)) {
    throw new ApiError(400, "Holiday date must be in YYYY-MM-DD format");
  }

  /*
  |--------------------------------------------------------------------------
  | Find Holiday
  |--------------------------------------------------------------------------
  */

  const holiday = await Holiday.findOne({ _id: id, tenantId: req.tenantId });

  if (!holiday) {
    throw new ApiError(404, "Holiday not found");
  }

  /*
  |--------------------------------------------------------------------------
  | Duplicate Date Check
  |--------------------------------------------------------------------------
  |
  | Make sure another holiday is not using the same date.
  |
  */

  const duplicate = await Holiday.findOne({
    tenantId: req.tenantId,
    date,
    _id: {
      $ne: id,
    },
  });

  if (duplicate) {
    throw new ApiError(
      400,
      "Another holiday is already registered for this date",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Update
  |--------------------------------------------------------------------------
  */

  holiday.date = date;
  holiday.title = title.trim();
  holiday.description = description?.trim() || "";

  await holiday.save();

  return ApiResponse.send(
    res,
    200,
    holiday,
    "Official holiday updated successfully",
  );
});

/*
|--------------------------------------------------------------------------
| Delete Official Holiday
|--------------------------------------------------------------------------
*/

export const deleteHoliday = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const holiday = await Holiday.findOneAndDelete({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!holiday) {
    throw new ApiError(404, "Holiday not found");
  }

  return ApiResponse.send(res, 200, null, "Holiday removed successfully");
});

export const importHolidaysold = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | ADMIN CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only HR Admin can import holiday list.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FILE CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file.",
      });
    }

    const csvText = req.file.buffer.toString("utf-8");

    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return res.status(400).json({
        success: false,
        message: "CSV file does not contain holiday records.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | HEADER
    |--------------------------------------------------------------------------
    */

    const header = lines[0]
      .split(",")
      .map((value) => value.trim().toLowerCase());

    const dateIndex = header.indexOf("date");
    const holidayIndex = header.indexOf("holiday");
    const descriptionIndex = header.indexOf("description");

    if (dateIndex === -1 || holidayIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain date and holiday columns.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | PARSE CSV
    |--------------------------------------------------------------------------
    */

    const holidaysToInsert = [];

    let skippedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i]
        .split(",")
        .map((value) => value.trim().replace(/^"|"$/g, ""));

      const dateValue = columns[dateIndex];
      const holidayName = columns[holidayIndex];
      const description =
        descriptionIndex >= 0 ? columns[descriptionIndex] || "" : "";

      if (!dateValue || !holidayName) {
        skippedCount++;
        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | DATE
      |--------------------------------------------------------------------------
      */

      let parsedDate;

      /*
       * Supports:
       * 02-10-2026
       * 02/10/2026
       * 2026-10-02
       */

      if (/^\d{2}-\d{2}-\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split("-");

        parsedDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split("/");

        parsedDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        parsedDate = new Date(`${dateValue}T00:00:00.000Z`);
      } else {
        skippedCount++;
        continue;
      }

      if (Number.isNaN(parsedDate.getTime())) {
        skippedCount++;
        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | DUPLICATE CHECK
      |--------------------------------------------------------------------------
      */

      const existingHoliday = await Holiday.findOne({
        tenantId: req.tenantId,
        date: parsedDate,
      });

      if (existingHoliday) {
        skippedCount++;
        continue;
      }

      holidaysToInsert.push({
        tenantId: req.tenantId,
        date: parsedDate,
        holiday: holidayName,
        description,
        createdBy: req.user._id,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | INSERT
    |--------------------------------------------------------------------------
    */

    let insertedHolidays = [];

    if (holidaysToInsert.length > 0) {
      insertedHolidays = await Holiday.insertMany(holidaysToInsert, {
        ordered: false,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      message: "Holiday list imported successfully.",
      data: {
        importedCount: insertedHolidays.length,
        skippedCount,
      },
    });
  } catch (error) {
    console.error("Import holiday list error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import holiday list.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| IMPORT OFFICIAL HOLIDAYS FROM CSV
|--------------------------------------------------------------------------
*/

export const importHolidays2 = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | ADMIN CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only HR Admin can import holiday list.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FILE CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file.",
      });
    }

    console.log("=================================");
    console.log("HOLIDAY CSV IMPORT");
    console.log("=================================");

    console.log("File name:", req.file.originalname);
    console.log("MIME type:", req.file.mimetype);
    console.log("File size:", req.file.size);

    /*
    |--------------------------------------------------------------------------
    | READ CSV FILE
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | Do NOT use:
    |
    | buffer.toString("utf-8-sig")
    |
    | Node does not support that encoding.
    |
    */

    const csvText = req.file.buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();

    console.log("CSV content:");
    console.log(csvText);

    if (!csvText) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | PARSE CSV
    |--------------------------------------------------------------------------
    */

    let records;

    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
    } catch (parseError) {
      console.error("CSV parsing error:", parseError);

      return res.status(400).json({
        success: false,
        message: "Invalid CSV file format.",
        error: parseError.message,
      });
    }

    console.log("Parsed CSV records:");
    console.log(records);

    /*
    |--------------------------------------------------------------------------
    | CHECK RECORDS
    |--------------------------------------------------------------------------
    */

    if (!records || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file does not contain holiday records.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE COLUMNS
    |--------------------------------------------------------------------------
    */

    const firstRecord = records[0];

    const columns = Object.keys(firstRecord).map((key) =>
      key.trim().toLowerCase(),
    );

    console.log("CSV columns:", columns);

    if (!columns.includes("date")) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain a 'date' column.",
      });
    }

    if (!columns.includes("holiday")) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain a 'holiday' column.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DATE PARSER
    |--------------------------------------------------------------------------
    */

    const parseHolidayDate = (value) => {
      if (!value) {
        return null;
      }

      const dateValue = String(value).trim();

      /*
      |--------------------------------------------------------------------------
      | DD-MM-YYYY
      |--------------------------------------------------------------------------
      */

      let match = dateValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);

      if (match) {
        const [, day, month, year] = match;

        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );

        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          return null;
        }

        return date;
      }

      /*
      |--------------------------------------------------------------------------
      | DD/MM/YYYY
      |--------------------------------------------------------------------------
      */

      match = dateValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

      if (match) {
        const [, day, month, year] = match;

        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );

        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          return null;
        }

        return date;
      }

      /*
      |--------------------------------------------------------------------------
      | YYYY-MM-DD
      |--------------------------------------------------------------------------
      */

      match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

      if (match) {
        const [, year, month, day] = match;

        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );

        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          return null;
        }

        return date;
      }

      return null;
    };

    /*
    |--------------------------------------------------------------------------
    | PREPARE INSERT DATA
    |--------------------------------------------------------------------------
    */

    const holidaysToInsert = [];

    let skippedCount = 0;

    const skippedRows = [];

    /*
    |--------------------------------------------------------------------------
    | PROCESS CSV ROWS
    |--------------------------------------------------------------------------
    */

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      const dateValue = row.date?.trim();

      const holidayName = row.holiday?.trim();

      const description = row.description?.trim() || "";

      console.log(`Processing CSV row ${i + 2}:`, {
        date: dateValue,
        holiday: holidayName,
        description,
      });

      /*
      |--------------------------------------------------------------------------
      | REQUIRED DATA
      |--------------------------------------------------------------------------
      */

      if (!dateValue || !holidayName) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          reason: "Date or holiday name is missing.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | PARSE DATE
      |--------------------------------------------------------------------------
      */

      const parsedDate = parseHolidayDate(dateValue);

      if (!parsedDate) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Invalid date. Use DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | SAME DAY RANGE
      |--------------------------------------------------------------------------
      */

      const startOfDay = new Date(parsedDate);

      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(parsedDate);

      endOfDay.setUTCHours(23, 59, 59, 999);

      /*
      |--------------------------------------------------------------------------
      | CHECK DATABASE DUPLICATE
      |--------------------------------------------------------------------------
      */

      const existingHoliday = await Holiday.findOne({
        tenantId: req.tenantId,
        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      });

      if (existingHoliday) {
        console.log(`Duplicate holiday found: ${dateValue} - ${holidayName}`);

        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Holiday already exists for this date.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | CHECK DUPLICATE INSIDE CURRENT CSV
      |--------------------------------------------------------------------------
      */

      const duplicateInFile = holidaysToInsert.some(
        (item) => item.date.getTime() === parsedDate.getTime(),
      );

      if (duplicateInFile) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Duplicate date exists in CSV.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | ADD HOLIDAY
      |--------------------------------------------------------------------------
      */

      holidaysToInsert.push({
        tenantId: req.tenantId,
        date: parsedDate,
        holiday: holidayName,
        description,
        createdBy: req.user._id,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | INSERT HOLIDAYS
    |--------------------------------------------------------------------------
    */

    let insertedHolidays = [];

    if (holidaysToInsert.length > 0) {
      insertedHolidays = await Holiday.insertMany(holidaysToInsert, {
        ordered: false,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | LOG RESULT
    |--------------------------------------------------------------------------
    */

    console.log("Inserted holidays:", insertedHolidays.length);

    console.log("Skipped holidays:", skippedCount);

    console.log("Skipped rows:", skippedRows);

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      message: "Holiday list imported successfully.",

      data: {
        importedCount: insertedHolidays.length,

        skippedCount,

        imported: insertedHolidays.map((holiday) => ({
          id: holiday._id,
          date: holiday.date,
          holiday: holiday.holiday,
          description: holiday.description,
        })),

        skipped: skippedRows,
      },
    });
  } catch (error) {
    console.error("=================================");

    console.error("IMPORT HOLIDAY LIST ERROR");

    console.error(error);

    console.error("=================================");

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import holiday list.",
    });
  }
};

export const importHolidays3 = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | ADMIN CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only HR Admin can import holiday list.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FILE CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file.",
      });
    }

    console.log("=================================");
    console.log("HOLIDAY CSV IMPORT");
    console.log("=================================");
    console.log("File:", req.file.originalname);
    console.log("MIME:", req.file.mimetype);
    console.log("Size:", req.file.size);

    /*
    |--------------------------------------------------------------------------
    | READ CSV
    |--------------------------------------------------------------------------
    */

    const csvText = req.file.buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();

    if (!csvText) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty.",
      });
    }

    console.log("CSV content:");
    console.log(csvText);

    /*
    |--------------------------------------------------------------------------
    | PARSE CSV
    |--------------------------------------------------------------------------
    */

    let records;

    try {
      records = parse(csvText, {
        columns: (headers) =>
          headers.map((header) => String(header).trim().toLowerCase()),

        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
        skip_records_with_empty_values: false,
      });
    } catch (parseError) {
      console.error("CSV parsing error:", parseError);

      return res.status(400).json({
        success: false,
        message: "Invalid CSV file format.",
        error: parseError.message,
      });
    }

    console.log("Parsed records:", records);

    /*
    |--------------------------------------------------------------------------
    | CHECK RECORDS
    |--------------------------------------------------------------------------
    */

    if (!records || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file does not contain holiday records.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE COLUMNS
    |--------------------------------------------------------------------------
    */

    const firstRecord = records[0];

    const columns = Object.keys(firstRecord).map((key) =>
      key.trim().toLowerCase(),
    );

    console.log("CSV columns:", columns);

    if (!columns.includes("date")) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain a 'date' column.",
      });
    }

    if (!columns.includes("holiday")) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain a 'holiday' column.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DATE PARSER
    |--------------------------------------------------------------------------
    */

    const parseHolidayDate = (value) => {
      if (!value) {
        return null;
      }

      const dateValue = String(value).trim();

      let match;

      /*
      |--------------------------------------------------------------------------
      | DD-MM-YYYY
      |--------------------------------------------------------------------------
      */

      match = dateValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);

      if (match) {
        const [, day, month, year] = match;

        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );

        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          return null;
        }

        return date;
      }

      /*
      |--------------------------------------------------------------------------
      | DD/MM/YYYY
      |--------------------------------------------------------------------------
      */

      match = dateValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

      if (match) {
        const [, day, month, year] = match;

        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );

        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          return null;
        }

        return date;
      }

      /*
      |--------------------------------------------------------------------------
      | YYYY-MM-DD
      |--------------------------------------------------------------------------
      */

      match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

      if (match) {
        const [, year, month, day] = match;

        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day)),
        );

        if (
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() !== Number(month) - 1 ||
          date.getUTCDate() !== Number(day)
        ) {
          return null;
        }

        return date;
      }

      return null;
    };

    /*
    |--------------------------------------------------------------------------
    | PREPARE DATA
    |--------------------------------------------------------------------------
    */

    const holidaysToInsert = [];

    let skippedCount = 0;

    const skippedRows = [];

    /*
    |--------------------------------------------------------------------------
    | PROCESS CSV
    |--------------------------------------------------------------------------
    */

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      const dateValue = String(row.date || "").trim();

      const holidayName = String(row.holiday || "").trim();

      const description = String(row.description || "").trim();

      console.log(`Processing row ${i + 2}:`, {
        date: dateValue,
        holiday: holidayName,
        description,
      });

      /*
      |--------------------------------------------------------------------------
      | REQUIRED FIELDS
      |--------------------------------------------------------------------------
      */

      if (!dateValue || !holidayName) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          reason: "Date or holiday name is missing.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | PARSE DATE
      |--------------------------------------------------------------------------
      */

      const parsedDate = parseHolidayDate(dateValue);

      if (!parsedDate) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Invalid date. Use DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | DAY RANGE
      |--------------------------------------------------------------------------
      */

      const startOfDay = new Date(parsedDate);

      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(parsedDate);

      endOfDay.setUTCHours(23, 59, 59, 999);

      /*
      |--------------------------------------------------------------------------
      | DATABASE DUPLICATE CHECK
      |--------------------------------------------------------------------------
      */

      const existingHoliday = await Holiday.findOne({
        tenantId: req.tenantId,
        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      });

      if (existingHoliday) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Holiday already exists for this date.",
        });

        console.log(`Skipping duplicate DB holiday: ${dateValue}`);

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | CSV DUPLICATE CHECK
      |--------------------------------------------------------------------------
      */

      const duplicateInFile = holidaysToInsert.some(
        (item) => item.date.getTime() === parsedDate.getTime(),
      );

      if (duplicateInFile) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Duplicate date exists in CSV.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | ADD HOLIDAY
      |--------------------------------------------------------------------------
      */

      holidaysToInsert.push({
        tenantId: req.tenantId,
        date: parsedDate,
        holiday: holidayName,
        description,
        createdBy: req.user._id,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | INSERT
    |--------------------------------------------------------------------------
    */

    let insertedHolidays = [];

    if (holidaysToInsert.length > 0) {
      insertedHolidays = await Holiday.insertMany(holidaysToInsert, {
        ordered: false,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    console.log("=================================");
    console.log("Imported:", insertedHolidays.length);
    console.log("Skipped:", skippedCount);
    console.log("Skipped rows:", skippedRows);
    console.log("=================================");

    return res.status(200).json({
      success: true,

      message:
        insertedHolidays.length > 0
          ? "Holiday list imported successfully."
          : "No new holidays were imported.",

      data: {
        importedCount: insertedHolidays.length,
        skippedCount,

        imported: insertedHolidays.map((holiday) => ({
          id: holiday._id,
          date: holiday.date,
          holiday: holiday.holiday,
          description: holiday.description,
        })),

        skipped: skippedRows,
      },
    });
  } catch (error) {
    console.error("=================================");
    console.error("IMPORT HOLIDAY LIST ERROR");
    console.error(error);
    console.error("=================================");

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import holiday list.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| IMPORT OFFICIAL HOLIDAYS FROM CSV
|--------------------------------------------------------------------------
|
| CSV format:
|
| date,holiday,description
| 02-10-2026,Gandhi Jayanti,Gandhi Jayanti
| 20-10-2026,Dussehra,Dussehra
|
| Supported date formats:
| DD-MM-YYYY
| DD/MM/YYYY
| YYYY-MM-DD
|
|--------------------------------------------------------------------------
*/
/*
|--------------------------------------------------------------------------
| PARSE HOLIDAY DATE
|--------------------------------------------------------------------------
*/

const parseHolidayDate = (value) => {
  if (!value) {
    return null;
  }

  const dateValue = String(value).trim();

  /*
  |--------------------------------------------------------------------------
  | DD-MM-YYYY
  |--------------------------------------------------------------------------
  */

  let match = dateValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;

    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }

    return `${year}-${month}-${day}`;
  }

  /*
  |--------------------------------------------------------------------------
  | DD/MM/YYYY
  |--------------------------------------------------------------------------
  */

  match = dateValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;

    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }

    return `${year}-${month}-${day}`;
  }

  /*
  |--------------------------------------------------------------------------
  | YYYY-MM-DD
  |--------------------------------------------------------------------------
  */

  match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const [, year, month, day] = match;

    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }

    return `${year}-${month}-${day}`;
  }

  return null;
};
export const importHolidays = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | ADMIN CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only HR Admin can import holiday list.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FILE CHECK
    |--------------------------------------------------------------------------
    */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file.",
      });
    }

    console.log("========================================");
    console.log("HOLIDAY CSV IMPORT");
    console.log("========================================");

    console.log("File Name:", req.file.originalname);
    console.log("MIME Type:", req.file.mimetype);
    console.log("File Size:", req.file.size);

    /*
    |--------------------------------------------------------------------------
    | READ CSV
    |--------------------------------------------------------------------------
    */

    const csvText = req.file.buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();

    console.log("CSV Content:");
    console.log(csvText);

    if (!csvText) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | PARSE CSV
    |--------------------------------------------------------------------------
    */

    let records;

    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
    } catch (parseError) {
      console.error("CSV Parse Error:", parseError);

      return res.status(400).json({
        success: false,
        message: "Invalid CSV file format.",
        error: parseError.message,
      });
    }

    console.log("Parsed Records:");
    console.log(records);

    /*
    |--------------------------------------------------------------------------
    | CHECK RECORDS
    |--------------------------------------------------------------------------
    */

    if (!records || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file does not contain holiday records.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE CSV COLUMNS
    |--------------------------------------------------------------------------
    */

    const firstRecord = records[0];

    const csvColumns = Object.keys(firstRecord).map((key) =>
      key.trim().toLowerCase(),
    );

    console.log("CSV Columns:", csvColumns);

    if (!csvColumns.includes("date")) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain a 'date' column.",
      });
    }

    if (!csvColumns.includes("holiday")) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain a 'holiday' column.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | PROCESS RECORDS
    |--------------------------------------------------------------------------
    */

    const holidaysToInsert = [];

    let skippedCount = 0;

    const skippedRows = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      const dateValue = String(row.date || "").trim();

      const holidayName = String(row.holiday || "").trim();

      const description = String(row.description || "").trim();

      console.log(`Processing CSV row ${i + 2}:`, {
        date: dateValue,
        holiday: holidayName,
        description,
      });

      /*
      |--------------------------------------------------------------------------
      | REQUIRED FIELDS
      |--------------------------------------------------------------------------
      */

      if (!dateValue || !holidayName) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Date or holiday name is missing.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | PARSE DATE
      |--------------------------------------------------------------------------
      */

      const normalizedDate = parseHolidayDate(dateValue);

      if (!normalizedDate) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Invalid date. Use DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | DATABASE DUPLICATE CHECK
      |--------------------------------------------------------------------------
      |
      | Holiday model stores date as String:
      |
      | YYYY-MM-DD
      |
      |--------------------------------------------------------------------------
      */

      const existingHoliday = await Holiday.findOne({
        tenantId: req.tenantId,
        date: normalizedDate,
      });

      if (existingHoliday) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Holiday already exists for this date.",
        });

        console.log(
          `Skipping duplicate holiday: ${normalizedDate} - ${holidayName}`,
        );

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | DUPLICATE CHECK INSIDE CSV
      |--------------------------------------------------------------------------
      */

      const duplicateInFile = holidaysToInsert.some(
        (item) => item.date === normalizedDate,
      );

      if (duplicateInFile) {
        skippedCount++;

        skippedRows.push({
          row: i + 2,
          date: dateValue,
          holiday: holidayName,
          reason: "Duplicate date exists inside CSV.",
        });

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | ADD TO INSERT LIST
      |--------------------------------------------------------------------------
      |
      | IMPORTANT:
      |
      | Model expects:
      |
      | date
      | title
      | description
      |
      |--------------------------------------------------------------------------
      */

      holidaysToInsert.push({
        tenantId: req.tenantId,
        date: normalizedDate,
        title: holidayName,
        description,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | INSERT INTO DATABASE
    |--------------------------------------------------------------------------
    */

    let insertedHolidays = [];

    if (holidaysToInsert.length > 0) {
      insertedHolidays = await Holiday.insertMany(holidaysToInsert, {
        ordered: false,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | LOG RESULT
    |--------------------------------------------------------------------------
    */

    console.log("========================================");
    console.log("HOLIDAY IMPORT RESULT");
    console.log("========================================");

    console.log("Total CSV Records:", records.length);
    console.log("Prepared for Insert:", holidaysToInsert.length);
    console.log("Imported:", insertedHolidays.length);
    console.log("Skipped:", skippedCount);
    console.log("Skipped Rows:", skippedRows);

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      message: "Holiday list imported successfully.",

      data: {
        totalRecords: records.length,

        importedCount: insertedHolidays.length,

        skippedCount,

        imported: insertedHolidays.map((holiday) => ({
          id: holiday._id,
          date: holiday.date,
          title: holiday.title,
          description: holiday.description,
        })),

        skipped: skippedRows,
      },
    });
  } catch (error) {
    console.error("========================================");
    console.error("HOLIDAY IMPORT ERROR");
    console.error("========================================");

    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import holiday list.",
    });
  }
};
