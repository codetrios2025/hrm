import React, { useState, useEffect } from "react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";

const MONTHS = [
  { value: 1, name: "January" },
  { value: 2, name: "February" },
  { value: 3, name: "March" },
  { value: 4, name: "April" },
  { value: 5, name: "May" },
  { value: 6, name: "June" },
  { value: 7, name: "July" },
  { value: 8, name: "August" },
  { value: 9, name: "September" },
  { value: 10, name: "October" },
  { value: 11, name: "November" },
  { value: 12, name: "December" },
];

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function MyAttendanceSheet() {
  const currentDate = new Date();

  const todayStr = `${currentDate.getFullYear()}-${String(
    currentDate.getMonth() + 1,
  ).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [activeMonth, setActiveMonth] = useState(currentDate.getMonth() + 1);

  const [activeYear, setActiveYear] = useState(currentDate.getFullYear());

  // ------------------------------------------------------------
  // Attendance
  // ------------------------------------------------------------

  const [attendanceMap, setAttendanceMap] = useState({});

  // ------------------------------------------------------------
  // Official Holidays
  // ------------------------------------------------------------

  const [holidayMap, setHolidayMap] = useState({});

  // ------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------

  const [loading, setLoading] = useState(false);
  const [holidayLoading, setHolidayLoading] = useState(false);

  const { showError } = useToast();

  // ============================================================
  // NORMALIZE DATE
  // ============================================================

  const normalizeDate = (dateValue) => {
    if (!dateValue) {
      return "";
    }

    // Already YYYY-MM-DD
    if (
      typeof dateValue === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ) {
      return dateValue;
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;
  };

  // ============================================================
  // FETCH ATTENDANCE
  // ============================================================

  const fetchAttendance = async (month, year) => {
    setLoading(true);

    try {
      const res = await api.get(
        `/attendance/my-history?month=${month}&year=${year}&limit=35&page=1`,
      );

      const responseData = res?.data || {};

      const records =
        responseData?.records ||
        responseData?.data?.records ||
        responseData?.data ||
        [];

      const map = {};

      if (Array.isArray(records)) {
        records.forEach((item) => {
          const dateKey = normalizeDate(item?.date);

          if (dateKey) {
            map[dateKey] = item;
          }
        });
      }

      setAttendanceMap(map);
    } catch (err) {
      console.error("Fetch attendance error:", err);

      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to fetch attendance records",
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // FETCH OFFICIAL HOLIDAYS
  // ============================================================

  const fetchHolidays = async (year) => {
    setHolidayLoading(true);

    try {
      /*
       * Backend route:
       *
       * GET /holidays?year=2026
       *
       * Backend currently supports year filtering.
       */

      const res = await api.get(`/holidays?year=${year}`);

      const responseData = res?.data || {};

      /*
       * Supports multiple possible ApiResponse structures:
       *
       * 1. res.data = [...]
       * 2. res.data.data = [...]
       * 3. res.data.data.holidays = [...]
       * 4. res.data.holidays = [...]
       */

      let holidays = [];

      if (Array.isArray(responseData)) {
        holidays = responseData;
      } else if (Array.isArray(responseData?.data)) {
        holidays = responseData.data;
      } else if (Array.isArray(responseData?.data?.holidays)) {
        holidays = responseData.data.holidays;
      } else if (Array.isArray(responseData?.holidays)) {
        holidays = responseData.holidays;
      }

      const map = {};

      holidays.forEach((holiday) => {
        const dateKey = normalizeDate(holiday?.date);

        if (!dateKey) {
          return;
        }

        map[dateKey] = {
          ...holiday,
          date: dateKey,
        };
      });

      setHolidayMap(map);
    } catch (err) {
      console.error("Fetch official holidays error:", err);

      /*
       * Do not stop attendance sheet if holiday API fails.
       * Attendance should continue working normally.
       */

      setHolidayMap({});

      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to fetch official holidays",
      );
    } finally {
      setHolidayLoading(false);
    }
  };

  // ============================================================
  // FETCH ATTENDANCE + HOLIDAYS
  // ============================================================

  useEffect(() => {
    fetchAttendance(activeMonth, activeYear);
    fetchHolidays(activeYear);
  }, [activeMonth, activeYear]);

  // ============================================================
  // MONTH / YEAR SUBMIT
  // ============================================================

  const handleSubmit = (e) => {
    e.preventDefault();

    setActiveMonth(Number(selectedMonth));
    setActiveYear(Number(selectedYear));
  };

  // ============================================================
  // FORMAT TIME
  // ============================================================

  const formatTime = (isoString) => {
    if (!isoString) {
      return "--:--";
    }

    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // ============================================================
  // RENDER STATUS BADGE
  // ============================================================

  const renderStatusBadge = (record, cell, holiday) => {
    // ----------------------------------------------------------
    // 1. OFFICIAL HOLIDAY
    // ----------------------------------------------------------

    if (holiday) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          HOLIDAY
        </span>
      );
    }

    // ----------------------------------------------------------
    // 2. Future / Weekend
    // ----------------------------------------------------------

    if (cell.isFuture || cell.isWeekend) {
      return null;
    }

    // ----------------------------------------------------------
    // 3. No attendance = Absent
    // ----------------------------------------------------------

    if (!record || (!record.clockIn && !record.totalHours)) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
          Absent
        </span>
      );
    }

    // ----------------------------------------------------------
    // 4. In Progress
    // ----------------------------------------------------------

    if (
      record.status === "in-progress" ||
      (!record.clockOut && record.clockIn)
    ) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
          In Progress
        </span>
      );
    }

    // ----------------------------------------------------------
    // 5. Completed shift
    // ----------------------------------------------------------

    const hours = parseFloat(record.totalHours || 0);

    if (hours >= 9) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          Full Day
        </span>
      );
    }

    if (hours >= 7) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
          Short Leave
        </span>
      );
    }

    if (hours >= 5) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          Half Day
        </span>
      );
    }

    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
        Absent (&lt;5h)
      </span>
    );
  };

  // ============================================================
  // CALENDAR CALCULATIONS
  // ============================================================

  const daysInMonth = new Date(activeYear, activeMonth, 0).getDate();

  const firstDayIndex = new Date(activeYear, activeMonth - 1, 1).getDay();

  const activeMonthName =
    MONTHS.find((m) => m.value === activeMonth)?.name || "";

  const calendarCells = [];

  // Empty cells before first day
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({
      empty: true,
      key: `empty-start-${i}`,
    });
  }

  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(activeYear, activeMonth - 1, day);

    const dayOfWeek = dayDate.getDay();

    const dayName = DAYS_OF_WEEK[dayOfWeek];

    const dateStr = `${activeYear}-${String(activeMonth).padStart(
      2,
      "0",
    )}-${String(day).padStart(2, "0")}`;

    const isFuture = dateStr > todayStr;

    calendarCells.push({
      empty: false,
      day,
      dayName,
      dateStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isFuture,
      key: dateStr,
    });
  }

  // Empty cells after last day
  const remaining = (7 - (calendarCells.length % 7)) % 7;

  for (let i = 0; i < remaining; i++) {
    calendarCells.push({
      empty: true,
      key: `empty-end-${i}`,
    });
  }

  // ============================================================
  // YEARS
  // ============================================================

  const currentYear = new Date().getFullYear();

  const years = [];

  for (let year = currentYear - 2; year <= currentYear + 3; year++) {
    years.push(year);
  }

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      {/* ========================================================
          TOP FILTER BAR
      ======================================================== */}

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2 mb-6 text-sm"
      >
        <label className="text-slate-600 font-medium">Select Month</label>

        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-800 text-xs focus:outline-none"
        >
          {MONTHS.map((month) => (
            <option key={month.value} value={month.value}>
              {month.name}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-800 text-xs focus:outline-none"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <button
          type="submit"
          style={{ backgroundColor: "#28a745" }}
          className="text-white font-semibold text-xs px-4 py-1.5 rounded transition hover:opacity-90 shadow-sm"
        >
          Submit
        </button>
      </form>

      {/* ========================================================
          CALENDAR TITLE
      ======================================================== */}

      <h2 className="text-center font-bold text-slate-700 text-base md:text-lg mb-4">
        {activeMonthName} {activeYear} (Attendances)
      </h2>

      {/* ========================================================
          HOLIDAY LEGEND
      ======================================================== */}

      <div className="flex flex-wrap items-center justify-center gap-3 mb-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
          <span className="text-slate-600 font-medium">Official Holiday</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
          <span className="text-slate-600 font-medium">Present</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-rose-100 border border-rose-200" />
          <span className="text-slate-600 font-medium">Absent</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
          <span className="text-slate-600 font-medium">Weekend</span>
        </div>
      </div>

      {/* ========================================================
          CALENDAR CONTAINER
      ======================================================== */}

      <div
        style={{ border: "1px solid #ea580c" }}
        className="rounded-sm overflow-hidden bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px] table-fixed">
            {/* ==================================================
                HEADER
            ================================================== */}

            <thead>
              <tr
                style={{
                  backgroundColor: "#5b9bd5",
                  color: "#ffffff",
                }}
              >
                {DAYS_OF_WEEK.map((day) => (
                  <th
                    key={day}
                    style={{
                      border: "1px solid #cbd5e1",
                    }}
                    className="py-2.5 px-2 text-center text-xs font-bold tracking-wide"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ==================================================
                CALENDAR BODY
            ================================================== */}

            <tbody>
              {Array.from({
                length: Math.ceil(calendarCells.length / 7),
              }).map((_, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {calendarCells
                    .slice(rowIndex * 7, rowIndex * 7 + 7)
                    .map((cell) => {
                      // ----------------------------------------
                      // Empty cell
                      // ----------------------------------------

                      if (cell.empty) {
                        return (
                          <td
                            key={cell.key}
                            style={{
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                            }}
                            className="h-24 align-top"
                          />
                        );
                      }

                      // ----------------------------------------
                      // Attendance record
                      // ----------------------------------------

                      const record = attendanceMap[cell.dateStr];

                      // ----------------------------------------
                      // Official Holiday
                      // ----------------------------------------

                      const holiday = holidayMap[cell.dateStr];

                      // ----------------------------------------
                      // Work hours
                      // ----------------------------------------

                      const hasWorkHours =
                        record &&
                        (Number(record.totalHours || 0) > 0 || record.clockIn);

                      // ----------------------------------------
                      // Holiday has highest priority
                      // ----------------------------------------

                      let cellBgColor = "#ffffff";

                      if (holiday) {
                        // Official holiday
                        cellBgColor = "#fef3c7";
                      } else if (hasWorkHours) {
                        // Present
                        cellBgColor = "#dcfce7";
                      } else if (cell.isWeekend) {
                        // Weekend
                        cellBgColor = "#e2e8f0";
                      } else if (cell.isFuture) {
                        // Future
                        cellBgColor = "#ffffff";
                      } else {
                        // Absent
                        cellBgColor = "#fed7d7";
                      }

                      const formattedDay = String(cell.day).padStart(2, "0");

                      return (
                        <td
                          key={cell.key}
                          style={{
                            border: "1px solid #cbd5e1",
                            backgroundColor: cellBgColor,
                          }}
                          className="p-0 align-top h-24"
                        >
                          {/* ====================================
                              DAY HEADER
                          ==================================== */}

                          <div
                            style={{
                              backgroundColor: holiday ? "#d97706" : "#64748b",
                              color: "#ffffff",
                            }}
                            className="text-[11px] font-bold px-2 py-1 flex items-center justify-start"
                          >
                            <span>
                              {formattedDay} {cell.dayName}
                            </span>
                          </div>

                          {/* ====================================
                              HOLIDAY CONTENT
                          ==================================== */}

                          {holiday ? (
                            <div className="p-2 text-[10px] space-y-1.5 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                                  HOLIDAY
                                </span>
                              </div>

                              <div className="font-bold text-amber-900 leading-tight">
                                {holiday.title || "Official Holiday"}
                              </div>

                              {holiday.description && (
                                <div className="text-amber-800 text-[9px] leading-tight">
                                  {holiday.description}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* ==================================
                               NORMAL ATTENDANCE CONTENT
                            ================================== */

                            <div className="p-2 text-[10px] space-y-1 font-medium">
                              {/* IN / OUT */}
                              <div className="text-slate-900 leading-snug">
                                <span className="text-slate-600 font-semibold">
                                  IN{" "}
                                </span>

                                <span className="font-bold">
                                  {record?.clockIn
                                    ? formatTime(record.clockIn)
                                    : "00:00 AM"}
                                </span>

                                <span className="text-slate-600 font-semibold">
                                  {" "}
                                  - OUT{" "}
                                </span>

                                <span className="font-bold">
                                  {record?.clockOut
                                    ? formatTime(record.clockOut)
                                    : "00:00 PM"}
                                </span>
                              </div>

                              {/* WORKING HOURS */}
                              <div className="text-slate-700 font-semibold pt-0.5 flex items-center justify-between">
                                <span>
                                  W Hrs:{" "}
                                  {record?.totalHours !== undefined &&
                                  record?.totalHours !== null
                                    ? `${Number(record.totalHours).toFixed(2)}`
                                    : record?.clockIn
                                      ? "In Progress"
                                      : "--"}
                                </span>
                              </div>

                              {/* STATUS */}
                              <div className="pt-0.5">
                                {renderStatusBadge(record, cell, holiday)}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          LOADING
      ======================================================== */}

      {(loading || holidayLoading) && (
        <p className="text-center text-xs text-slate-400 mt-3">
          {holidayLoading
            ? "Loading attendance and official holidays..."
            : "Loading attendance records..."}
        </p>
      )}
    </div>
  );
}
