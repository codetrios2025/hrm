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

  const [attendanceMap, setAttendanceMap] = useState({});
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();

  const fetchAttendance = async (m, y) => {
    setLoading(true);
    try {
      const res = await api.get(
        `/attendance/my-history?month=${m}&year=${y}&limit=35&page=1`,
      );
      const map = {};
      const records = res.data?.records || res.data?.data?.records || [];
      records.forEach((item) => {
        map[item.date] = item;
      });
      setAttendanceMap(map);
    } catch (err) {
      showError(err.message || "Failed to fetch attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance(activeMonth, activeYear);
  }, [activeMonth, activeYear]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setActiveMonth(Number(selectedMonth));
    setActiveYear(Number(selectedYear));
  };

  const formatTime = (isoString) => {
    if (!isoString) return "--:--";
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Helper to determine status badge and tier styling
  const renderStatusBadge = (record, cell) => {
    // 1. If date is in the future or weekend, do not show absent badge
    if (cell.isFuture || cell.isWeekend) {
      return null;
    }

    // 2. If no attendance recorded on a past weekday, mark Absent
    if (!record || (!record.clockIn && !record.totalHours)) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
          Absent
        </span>
      );
    }

    // 3. In Progress (today's active shift)
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

    // 4. Completed shift hours tier
    const hours = parseFloat(record.totalHours || 0);

    if (hours >= 9) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          Full Day
        </span>
      );
    } else if (hours >= 7) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
          Short Leave
        </span>
      );
    } else if (hours >= 5) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          Half Day
        </span>
      );
    } else {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
          Absent (&lt;5h)
        </span>
      );
    }
  };

  // Calendar calculations
  const daysInMonth = new Date(activeYear, activeMonth, 0).getDate();
  const firstDayIndex = new Date(activeYear, activeMonth - 1, 1).getDay(); // 0 = Sunday

  const activeMonthName =
    MONTHS.find((m) => m.value === activeMonth)?.name || "";

  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ empty: true, key: `empty-start-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(activeYear, activeMonth - 1, day);
    const dayOfWeek = dayDate.getDay();
    const dayName = DAYS_OF_WEEK[dayOfWeek];
    const dateStr = `${activeYear}-${String(activeMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const remaining = (7 - (calendarCells.length % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    calendarCells.push({ empty: true, key: `empty-end-${i}` });
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      {/* Top Filter Bar */}
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
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-800 text-xs focus:outline-none"
        >
          <option value="">--Select Year--</option>
          {[2024, 2025, 2026, 2027, 2028].map((yr) => (
            <option key={yr} value={yr}>
              {yr}
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

      {/* Calendar Header Title */}
      <h2 className="text-center font-bold text-slate-700 text-base md:text-lg mb-4">
        {activeMonthName} {activeYear} (Attendances)
      </h2>

      {/* Container with border */}
      <div
        style={{ border: "1px solid #ea580c" }}
        className="rounded-sm overflow-hidden bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px] table-fixed">
            {/* Header Columns (Blue) */}
            <thead>
              <tr style={{ backgroundColor: "#5b9bd5", color: "#ffffff" }}>
                {DAYS_OF_WEEK.map((day) => (
                  <th
                    key={day}
                    style={{ border: "1px solid #cbd5e1" }}
                    className="py-2.5 px-2 text-center text-xs font-bold tracking-wide"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Calendar Rows */}
            <tbody>
              {Array.from({ length: Math.ceil(calendarCells.length / 7) }).map(
                (_, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {calendarCells
                      .slice(rowIndex * 7, rowIndex * 7 + 7)
                      .map((cell) => {
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

                        const record = attendanceMap[cell.dateStr];
                        const formattedDay = String(cell.day).padStart(2, "0");

                        const hasWorkHours =
                          record && (record.totalHours > 0 || record.clockIn);

                        // Cell background logic:
                        // 1. Present -> Green (#dcfce7)
                        // 2. Weekend -> Grey (#e2e8f0)
                        // 3. Future dates -> White (#ffffff)
                        // 4. Past working days without punch -> Pink Absent (#fed7d7)
                        const cellBgColor = hasWorkHours
                          ? "#dcfce7"
                          : cell.isWeekend
                            ? "#e2e8f0"
                            : cell.isFuture
                              ? "#ffffff"
                              : "#fed7d7";

                        return (
                          <td
                            key={cell.key}
                            style={{
                              border: "1px solid #cbd5e1",
                              backgroundColor: cellBgColor,
                            }}
                            className="p-0 align-top h-24"
                          >
                            {/* Day Header Strip (Grey) */}
                            <div
                              style={{
                                backgroundColor: "#64748b",
                                color: "#ffffff",
                              }}
                              className="text-[11px] font-bold px-2 py-1 flex items-center justify-start"
                            >
                              <span>
                                {formattedDay} {cell.dayName}
                              </span>
                            </div>

                            {/* Attendance Info */}
                            <div className="p-2 text-[10px] space-y-1 font-medium">
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

                              {/* Status Badge */}
                              <div className="pt-0.5">
                                {renderStatusBadge(record, cell)}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && (
        <p className="text-center text-xs text-slate-400 mt-3">
          Loading attendance records...
        </p>
      )}
    </div>
  );
}
