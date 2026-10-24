import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  RefreshCw,
  Search,
  User,
} from "lucide-react";

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

const PAGE_SIZE = 5;

export default function AdminEmployeeAttendance() {
  const currentDate = new Date();

  const todayStr = `${currentDate.getFullYear()}-${String(
    currentDate.getMonth() + 1,
  ).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

  // ============================================================
  // STATE
  // ============================================================

  const [employees, setEmployees] = useState([]);

  const [todayAttendance, setTodayAttendance] = useState([]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [attendanceMap, setAttendanceMap] = useState({});

  // Official holidays keyed by YYYY-MM-DD
  const [officialHolidayMap, setOfficialHolidayMap] = useState({});
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [loadingToday, setLoadingToday] = useState(false);

  const [loadingHistory, setLoadingHistory] = useState(false);

  const [searchText, setSearchText] = useState("");

  const [currentPage, setCurrentPage] = useState(1);

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [activeMonth, setActiveMonth] = useState(currentDate.getMonth() + 1);

  const [activeYear, setActiveYear] = useState(currentDate.getFullYear());

  const { showError } = useToast();

  // ============================================================
  // HELPER - EXTRACT ARRAY FROM API RESPONSE
  // ============================================================

  const extractArray = (response, possibleKeys = []) => {
    for (const key of possibleKeys) {
      const value = response?.data?.[key];

      if (Array.isArray(value)) {
        return value;
      }
    }

    if (Array.isArray(response?.data?.data)) {
      return response.data.data;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    return [];
  };

  // ============================================================
  // MERGE STAFF + TODAY ATTENDANCE
  // ============================================================

  const mergeEmployeeAttendance = (staffList = [], attendanceList = []) => {
    const attendanceMapByEmployeeId = new Map();

    attendanceList.forEach((attendance) => {
      const employeeId = String(attendance?.employeeId || "")
        .trim()
        .toUpperCase();

      if (employeeId) {
        attendanceMapByEmployeeId.set(employeeId, attendance);
      }
    });

    return staffList.map((employee) => {
      const employeeId = String(employee?.employeeId || employee?.empId || "")
        .trim()
        .toUpperCase();

      const attendance = attendanceMapByEmployeeId.get(employeeId);

      return {
        ...employee,

        // ------------------------------------------------------
        // EMPLOYEE INFORMATION
        // ------------------------------------------------------

        employeeId:
          employee?.employeeId ||
          employee?.empId ||
          attendance?.employeeId ||
          "",

        employeeName:
          employee?.employeeName ||
          employee?.name ||
          attendance?.employeeName ||
          "",

        employeeEmail:
          employee?.employeeEmail ||
          employee?.email ||
          attendance?.employeeEmail ||
          "",

        name:
          employee?.name ||
          employee?.employeeName ||
          attendance?.employeeName ||
          "",

        email:
          employee?.email ||
          employee?.employeeEmail ||
          attendance?.employeeEmail ||
          "",

        // ------------------------------------------------------
        // TODAY ATTENDANCE
        // ------------------------------------------------------

        punchIn:
          attendance?.punchIn ??
          attendance?.clockIn ??
          employee?.punchIn ??
          employee?.clockIn ??
          null,

        punchOut:
          attendance?.punchOut ??
          attendance?.clockOut ??
          employee?.punchOut ??
          employee?.clockOut ??
          null,

        clockIn:
          attendance?.clockIn ??
          attendance?.punchIn ??
          employee?.clockIn ??
          employee?.punchIn ??
          null,

        clockOut:
          attendance?.clockOut ??
          attendance?.punchOut ??
          employee?.clockOut ??
          employee?.punchOut ??
          null,

        totalHours:
          attendance?.totalHours ??
          attendance?.hours ??
          employee?.totalHours ??
          employee?.hours ??
          0,

        activeMinutes:
          attendance?.activeMinutes ?? employee?.activeMinutes ?? 0,

        attendanceStatus:
          attendance?.attendanceStatus ?? employee?.attendanceStatus ?? null,

        status:
          attendance?.status ??
          attendance?.attendanceStatus ??
          employee?.status ??
          "Not Punched",

        attendanceId:
          attendance?.attendanceId ??
          attendance?._id ??
          employee?.attendanceId ??
          null,

        attendanceRecord: attendance || null,
      };
    });
  };

  // ============================================================
  // LOAD STAFF + TODAY ATTENDANCE
  // IMPORTANT:
  // BOTH APIs ARE LOADED TOGETHER
  // ============================================================

  const loadEmployeeAttendance = async () => {
    try {
      setLoadingEmployees(true);
      setLoadingToday(true);

      const [staffResponse, attendanceResponse] = await Promise.all([
        api.get("/admin/staff?page=1&limit=1000"),

        api.get("/admin/today-employee-attendance"),
      ]);

      // ========================================================
      // STAFF DATA
      // ========================================================

      const staffList = extractArray(staffResponse, [
        "staff",
        "employees",
        "users",
      ]);

      // ========================================================
      // ATTENDANCE DATA
      // ========================================================

      const attendanceList = extractArray(attendanceResponse, [
        "employees",
        "attendance",
        "records",
        "todayAttendance",
      ]);

      console.log("STAFF RESPONSE:", staffResponse?.data);

      console.log("TODAY ATTENDANCE RESPONSE:", attendanceResponse?.data);

      console.log("STAFF LIST:", staffList);

      console.log("TODAY ATTENDANCE LIST:", attendanceList);

      // ========================================================
      // SAVE RAW ATTENDANCE
      // ========================================================

      setTodayAttendance(attendanceList);

      // ========================================================
      // MERGE
      // ========================================================

      const mergedEmployees = mergeEmployeeAttendance(
        staffList,
        attendanceList,
      );

      console.log("MERGED EMPLOYEES:", mergedEmployees);

      setEmployees(mergedEmployees);

      // Reset pagination after refresh
      setCurrentPage(1);
    } catch (err) {
      console.error("Employee attendance loading error:", err);

      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load employee attendance",
      );
    } finally {
      setLoadingEmployees(false);
      setLoadingToday(false);
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadEmployeeAttendance();
  }, []);

  // ============================================================
  // SEARCH
  // ============================================================

  const filteredEmployees = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    if (!search) {
      return employees;
    }

    return employees.filter((employee) => {
      const employeeId = String(employee?.employeeId || "").toLowerCase();

      const employeeName = String(
        employee?.employeeName || employee?.name || "",
      ).toLowerCase();

      const employeeEmail = String(
        employee?.employeeEmail || employee?.email || "",
      ).toLowerCase();

      return (
        employeeId.includes(search) ||
        employeeName.includes(search) ||
        employeeEmail.includes(search)
      );
    });
  }, [employees, searchText]);

  // ============================================================
  // RESET PAGINATION WHEN SEARCH CHANGES
  // ============================================================

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  // ============================================================
  // PAGINATION
  // ============================================================

  const totalEmployees = filteredEmployees.length;

  const totalPages = Math.max(1, Math.ceil(totalEmployees / PAGE_SIZE));

  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    return filteredEmployees.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredEmployees, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startRecord =
    totalEmployees === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;

  const endRecord = Math.min(currentPage * PAGE_SIZE, totalEmployees);

  // ============================================================
  // SELECT EMPLOYEE
  // ============================================================

  const handleEmployeeSelect = (employeeId) => {
    setSelectedEmployeeId(employeeId);

    if (employeeId) {
      fetchEmployeeHistory(employeeId, activeMonth, activeYear);
    } else {
      setAttendanceMap({});
    }
  };

  // ============================================================
  // OFFICIAL HOLIDAYS
  // ============================================================

  const normalizeHolidayDate = (value) => {
    if (!value) return "";

    if (typeof value === "string") {
      const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
      if (isoMatch) return isoMatch[0];

      const dmyMatch = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
      if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
      }
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  };

  const fetchOfficialHolidays = async () => {
    try {
      setLoadingHolidays(true);

      // GET / is the read endpoint in holiday.routes.js.
      const response = await api.get("/holidays");
      const holidays =
        extractArray(response, ["holidays", "records", "items"]) ||
        response?.data?.data?.holidays ||
        response?.data?.data?.records ||
        response?.data?.data?.items ||
        response?.data?.data ||
        [];

      const nextMap = {};

      holidays.forEach((item) => {
        const dateKey = normalizeHolidayDate(
          item?.date ?? item?.holidayDate ?? item?.dateStr,
        );
        if (!dateKey) return;

        const name =
          item?.holiday ?? item?.name ?? item?.title ?? "Official Holiday";
        const description = item?.description || "";

        if (!nextMap[dateKey]) {
          nextMap[dateKey] = {
            ...item,
            date: dateKey,
            holiday: name,
            description,
          };
        } else {
          const names = String(nextMap[dateKey].holiday || "").split(", ");
          if (!names.includes(name)) {
            nextMap[dateKey].holiday = `${names.join(", ")}, ${name}`;
          }
        }
      });

      setOfficialHolidayMap(nextMap);
    } catch (err) {
      console.error("Official holiday loading error:", err);
      setOfficialHolidayMap({});
      showError(
        err?.response?.data?.message ||
          "Unable to load official holidays. Please check the holidays API.",
      );
    } finally {
      setLoadingHolidays(false);
    }
  };

  useEffect(() => {
    fetchOfficialHolidays();
  }, [activeMonth, activeYear]);

  // ============================================================
  // FETCH EMPLOYEE HISTORY
  // ============================================================

  const fetchEmployeeHistory = async (employeeId, month, year) => {
    if (!employeeId) {
      return;
    }

    try {
      setLoadingHistory(true);

      const query = new URLSearchParams({
        employeeId: String(employeeId),
        month: String(month),
        year: String(year),
      }).toString();

      const res = await api.get(`/admin/employee-attendance-history?${query}`);

      const records =
        res?.data?.records ||
        res?.data?.data?.records ||
        res?.data?.attendance ||
        res?.data?.data?.attendance ||
        res?.data?.data ||
        [];

      const recordList = Array.isArray(records) ? records : [];

      console.log("EMPLOYEE HISTORY RESPONSE:", res?.data);

      console.log("EMPLOYEE HISTORY RECORDS:", recordList);

      const map = {};

      recordList.forEach((record) => {
        const date = record?.date || record?.dateStr || record?.attendanceDate;

        if (!date) {
          return;
        }

        // Normalize ISO date if necessary
        const normalizedDate = String(date).substring(0, 10);

        map[normalizedDate] = {
          ...record,

          // Support both API naming styles
          punchIn: record?.punchIn ?? record?.clockIn ?? null,

          punchOut: record?.punchOut ?? record?.clockOut ?? null,

          clockIn: record?.clockIn ?? record?.punchIn ?? null,

          clockOut: record?.clockOut ?? record?.punchOut ?? null,

          totalHours: record?.totalHours ?? record?.hours ?? 0,

          activeMinutes: record?.activeMinutes ?? 0,

          status: record?.status ?? record?.attendanceStatus ?? null,

          attendanceStatus: record?.attendanceStatus ?? record?.status ?? null,
        };
      });

      setAttendanceMap(map);
    } catch (err) {
      console.error("Employee history error:", err);

      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load employee attendance history",
      );

      setAttendanceMap({});
    } finally {
      setLoadingHistory(false);
    }
  };

  // ============================================================
  // MONTH SUBMIT
  // ============================================================

  const handleSubmit = (e) => {
    e.preventDefault();

    const month = Number(selectedMonth);

    const year = Number(selectedYear);

    setActiveMonth(month);
    setActiveYear(year);

    if (selectedEmployeeId) {
      fetchEmployeeHistory(selectedEmployeeId, month, year);
    }
  };

  // ============================================================
  // FORMAT TIME
  // ============================================================

  const formatTime = (value) => {
    if (!value) {
      return "--:--";
    }

    // If already a Date object
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return "--:--";
      }

      return value.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }

    // If API sends only HH:mm / HH:mm:ss
    if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
      const parts = value.split(":");

      let hour = Number(parts[0]);

      const minute = Number(parts[1]);

      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return "--:--";
      }

      const suffix = hour >= 12 ? "PM" : "AM";

      hour = hour % 12 || 12;

      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
        2,
        "0",
      )} ${suffix}`;
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return "--:--";
    }

    return parsedDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // ============================================================
  // FORMAT HOURS
  // ============================================================

  const formatHours = (employee) => {
    if (!employee) {
      return "--";
    }

    const totalHours = Number(employee?.totalHours ?? employee?.hours ?? 0);

    if (Number.isNaN(totalHours)) {
      return "--";
    }

    const activeMinutes = Number(employee?.activeMinutes ?? 0);

    // Employee currently punched in
    if (employee?.punchIn && !employee?.punchOut && activeMinutes > 0) {
      const hours = Math.floor(activeMinutes / 60);

      const minutes = activeMinutes % 60;

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }

      return `${minutes}m`;
    }

    if (totalHours > 0) {
      return `${totalHours.toFixed(2)} hrs`;
    }

    return "--";
  };

  // ============================================================
  // STATUS CLASS
  // ============================================================

  const getStatusClass = (status) => {
    const normalized = String(status || "")
      .toLowerCase()
      .trim();

    switch (normalized) {
      case "present":
      case "completed":
      case "full-day":
      case "full_day":
      case "full day":
        return "bg-emerald-100 text-emerald-700";

      case "in-progress":
      case "in_progress":
      case "in process":
        return "bg-blue-100 text-blue-700";

      case "absent":
        return "bg-rose-100 text-rose-700";

      case "short leave":
      case "short-leave":
      case "short_leave":
        return "bg-amber-100 text-amber-700";

      case "half-day":
      case "half_day":
      case "half day":
        return "bg-orange-100 text-orange-700";

      case "leave":
        return "bg-purple-100 text-purple-700";

      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  // ============================================================
  // FORMAT STATUS
  // ============================================================

  const formatStatus = (status) => {
    if (!status) {
      return "Not Punched";
    }

    const normalized = String(status).toLowerCase().trim();

    if (
      normalized === "in-progress" ||
      normalized === "in_progress" ||
      normalized === "in process"
    ) {
      return "In Process";
    }

    if (normalized === "completed") {
      return "Completed";
    }

    if (normalized === "full-day" || normalized === "full_day") {
      return "Full Day";
    }

    return String(status)
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // ============================================================
  // GET EMPLOYEE STATUS
  // ============================================================

  const getEmployeeStatus = (employee) => {
    if (!employee) {
      return "Not Punched";
    }

    if (employee?.attendanceStatus) {
      return employee.attendanceStatus;
    }

    if (employee?.status) {
      return employee.status;
    }

    if (employee?.punchIn && !employee?.punchOut) {
      return "In Process";
    }

    if (employee?.punchIn && employee?.punchOut) {
      return "Completed";
    }

    return "Not Punched";
  };

  // ============================================================
  // CALENDAR STATUS BADGE
  // ============================================================

  const renderStatusBadge = (record, cell) => {
    const holiday = officialHolidayMap[cell.dateStr];

    if (holiday) {
      return (
        <span
          title={holiday.description || holiday.holiday}
          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
        >
          Holiday
        </span>
      );
    }

    if (cell.isFuture) {
      return null;
    }

    if (cell.isWeekend) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
          Weekend
        </span>
      );
    }

    if (!record) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
          Absent
        </span>
      );
    }

    const recordStatus = String(
      record?.attendanceStatus || record?.status || "",
    )
      .toLowerCase()
      .trim();

    if (
      recordStatus === "in-progress" ||
      recordStatus === "in_progress" ||
      recordStatus === "in process" ||
      (record?.punchIn && !record?.punchOut)
    ) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
          In Process
        </span>
      );
    }

    const hours = Number(record?.totalHours ?? record?.hours ?? 0);

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

    if (record?.punchIn) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
          Present
        </span>
      );
    }

    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
        Absent
      </span>
    );
  };

  // ============================================================
  // CALENDAR
  // ============================================================

  const daysInMonth = new Date(activeYear, activeMonth, 0).getDate();

  const firstDayIndex = new Date(activeYear, activeMonth - 1, 1).getDay();

  const activeMonthName =
    MONTHS.find((item) => item.value === activeMonth)?.name || "";

  const calendarCells = [];

  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({
      empty: true,
      key: `empty-start-${i}`,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(activeYear, activeMonth - 1, day);

    const dayOfWeek = dayDate.getDay();

    const dateStr = `${activeYear}-${String(activeMonth).padStart(
      2,
      "0",
    )}-${String(day).padStart(2, "0")}`;

    calendarCells.push({
      empty: false,
      day,
      dateStr,
      dayName: DAYS_OF_WEEK[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isFuture: dateStr > todayStr,
      key: dateStr,
    });
  }

  const remaining = (7 - (calendarCells.length % 7)) % 7;

  for (let i = 0; i < remaining; i++) {
    calendarCells.push({
      empty: true,
      key: `empty-end-${i}`,
    });
  }

  // ============================================================
  // SELECTED EMPLOYEE
  // ============================================================

  const selectedEmployee =
    employees.find(
      (employee) =>
        String(employee?._id || employee?.userId) ===
        String(selectedEmployeeId),
    ) ||
    employees.find(
      (employee) => String(employee?.employeeId) === String(selectedEmployeeId),
    );

  // ============================================================
  // REFRESH
  // ============================================================

  const handleRefresh = () => {
    loadEmployeeAttendance();
    fetchOfficialHolidays();
  };

  // ============================================================
  // PAGINATION BUTTONS
  // ============================================================

  const renderPaginationButtons = () => {
    if (totalPages <= 1) {
      return null;
    }

    const buttons = [];

    // Previous
    buttons.push(
      <button
        key="previous"
        type="button"
        disabled={currentPage === 1}
        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
        className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>,
    );

    // Page numbers
    for (let page = 1; page <= totalPages; page++) {
      buttons.push(
        <button
          key={page}
          type="button"
          onClick={() => setCurrentPage(page)}
          className={`w-8 h-8 rounded-lg text-xs font-medium border ${
            currentPage === page
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {page}
        </button>,
      );
    }

    // Next
    buttons.push(
      <button
        key="next"
        type="button"
        disabled={currentPage === totalPages}
        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
        className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>,
    );

    return buttons;
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      {/* ====================================================== */}
      {/* TODAY EMPLOYEE ATTENDANCE */}
      {/* ====================================================== */}

      {!selectedEmployeeId && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {/* Header */}

          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />

                <h2 className="text-lg font-semibold text-slate-800">
                  Employee Attendance
                </h2>
              </div>

              <p className="text-xs text-slate-500 mt-1">
                Today's employee punch-in and attendance status
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingToday || loadingEmployees}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loadingToday || loadingEmployees ? "animate-spin" : ""
                }`}
              />
              Refresh
            </button>
          </div>

          {/* Search */}

          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search Employee ID, name or email..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {/* Table */}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="p-3">Employee ID</th>

                  <th className="p-3">Employee Name</th>

                  <th className="p-3">Email</th>

                  <th className="p-3">Punch In</th>

                  <th className="p-3">Punch Out</th>

                  <th className="p-3">Hours</th>

                  <th className="p-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loadingToday || loadingEmployees ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Loading employee attendance...
                      </div>
                    </td>
                  </tr>
                ) : paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((employee) => {
                    const employeeName =
                      employee?.employeeName || employee?.name || "-";

                    const employeeEmail =
                      employee?.employeeEmail || employee?.email || "-";

                    const employeeKey =
                      employee?._id || employee?.userId || employee?.employeeId;

                    const selectionId =
                      employee?._id || employee?.userId || employee?.employeeId;

                    const punchIn =
                      employee?.punchIn ?? employee?.clockIn ?? null;

                    const punchOut =
                      employee?.punchOut ?? employee?.clockOut ?? null;

                    const status = getEmployeeStatus(employee);

                    return (
                      <tr
                        key={employeeKey}
                        className="hover:bg-indigo-50/40 transition"
                      >
                        {/* Employee ID */}

                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleEmployeeSelect(selectionId)}
                            className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            {employee?.employeeId || "N/A"}
                          </button>
                        </td>

                        {/* Employee Name */}

                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleEmployeeSelect(selectionId)}
                            className="font-medium text-slate-800 hover:text-indigo-600"
                          >
                            {employeeName}
                          </button>
                        </td>

                        {/* Email */}

                        <td className="p-3 text-slate-500">{employeeEmail}</td>

                        {/* Punch In */}

                        <td className="p-3 whitespace-nowrap font-medium text-slate-700">
                          {formatTime(punchIn)}
                        </td>

                        {/* Punch Out */}

                        <td className="p-3 whitespace-nowrap font-medium text-slate-700">
                          {formatTime(punchOut)}
                        </td>

                        {/* Hours */}

                        <td className="p-3 font-medium whitespace-nowrap">
                          {formatHours(employee)}
                        </td>

                        {/* Status */}

                        <td className="p-3">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                              status,
                            )}`}
                          >
                            {formatStatus(status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}

          {totalEmployees > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-medium text-slate-700">
                  {startRecord}
                </span>{" "}
                to{" "}
                <span className="font-medium text-slate-700">{endRecord}</span>{" "}
                of{" "}
                <span className="font-medium text-slate-700">
                  {totalEmployees}
                </span>{" "}
                employees
              </div>

              <div className="flex items-center gap-1.5">
                {renderPaginationButtons()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================== */}
      {/* SELECTED EMPLOYEE ATTENDANCE SHEET */}
      {/* ====================================================== */}

      {selectedEmployeeId && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          {/* Header */}

          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedEmployeeId("");
                  setAttendanceMap({});
                }}
                className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
                All Employees
              </button>

              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  Employee Attendance Sheet
                </h2>

                {selectedEmployee && (
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedEmployee?.name ||
                      selectedEmployee?.employeeName ||
                      "-"}

                    {" ("}

                    {selectedEmployee?.employeeId || "-"}

                    {")"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Employee Selector */}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Employee */}

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Select Employee
                </label>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => handleEmployeeSelect(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Select Employee</option>

                    {employees.map((employee) => {
                      const value =
                        employee?._id ||
                        employee?.userId ||
                        employee?.employeeId;

                      return (
                        <option
                          key={
                            employee?._id ||
                            employee?.userId ||
                            employee?.employeeId
                          }
                          value={value}
                        >
                          {employee?.employeeId || "N/A"} -{" "}
                          {employee?.name ||
                            employee?.employeeName ||
                            "Unknown"}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Month */}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Month
                </label>

                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Year
                </label>

                <div className="flex gap-2">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loadingHistory}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {loadingHistory ? "Loading..." : "Submit"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Information */}

          {selectedEmployee && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {/* Employee */}

              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <User className="w-4 h-4" />
                  Employee
                </div>

                <div className="font-semibold text-slate-800 mt-1">
                  {selectedEmployee?.name ||
                    selectedEmployee?.employeeName ||
                    "-"}
                </div>

                <div className="text-xs text-slate-500">
                  {selectedEmployee?.employeeId || "-"}
                </div>
              </div>

              {/* Email */}

              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Mail className="w-4 h-4" />
                  Email
                </div>

                <div className="font-medium text-slate-700 mt-1 break-all">
                  {selectedEmployee?.email ||
                    selectedEmployee?.employeeEmail ||
                    "-"}
                </div>
              </div>

              {/* Period */}

              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Calendar className="w-4 h-4" />
                  Attendance Period
                </div>

                <div className="font-semibold text-slate-800 mt-1">
                  {activeMonthName} {activeYear}
                </div>
              </div>
            </div>
          )}

          {/* Calendar Header */}

          <h2 className="text-center font-bold text-slate-700 text-base md:text-lg mb-4">
            {activeMonthName} {activeYear} (Attendance)
          </h2>

          {/* Calendar */}

          <div
            style={{
              border: "1px solid #ea580c",
            }}
            className="rounded-sm overflow-hidden bg-white shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[800px] table-fixed">
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
                        className="py-2.5 px-2 text-center text-xs font-bold"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Array.from({
                    length: Math.ceil(calendarCells.length / 7),
                  }).map((_, rowIndex) => (
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
                                className="h-24"
                              />
                            );
                          }

                          const record = attendanceMap[cell.dateStr];

                          const punchIn =
                            record?.punchIn ?? record?.clockIn ?? null;

                          const punchOut =
                            record?.punchOut ?? record?.clockOut ?? null;

                          const hasWorkHours =
                            record &&
                            (punchIn ||
                              Number(record?.totalHours ?? record?.hours ?? 0) >
                                0);

                          const holiday = officialHolidayMap[cell.dateStr];

                          const cellBgColor = holiday
                            ? "#fef3c7"
                            : hasWorkHours
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
                              {/* Day Header */}

                              <div
                                style={{
                                  backgroundColor: holiday
                                    ? "#d97706"
                                    : "#64748b",
                                  color: "#ffffff",
                                }}
                                className="px-2 py-1 text-[11px] font-bold"
                              >
                                {String(cell.day).padStart(2, "0")}{" "}
                                {cell.dayName}
                              </div>

                              {/* Day Content */}

                              <div className="p-2 space-y-1">
                                {holiday ? (
                                  <>
                                    <div>
                                      <span className="inline-block rounded border border-amber-400 bg-amber-200 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-amber-900">
                                        HOLIDAY
                                      </span>
                                    </div>

                                    <div
                                      className="text-[10px] font-bold text-amber-950 leading-tight"
                                      title={
                                        holiday.description || holiday.holiday
                                      }
                                    >
                                      {holiday.holiday || "Official Holiday"}
                                    </div>

                                    {holiday.description &&
                                      holiday.description !==
                                        holiday.holiday && (
                                        <div className="text-[9px] text-amber-900 leading-tight">
                                          {holiday.description}
                                        </div>
                                      )}
                                  </>
                                ) : (
                                  <>
                                    <div className="text-[10px] text-slate-700">
                                      IN <strong>{formatTime(punchIn)}</strong>
                                      {" - "}
                                      OUT{" "}
                                      <strong>{formatTime(punchOut)}</strong>
                                    </div>

                                    <div className="text-[10px] text-slate-700">
                                      W Hrs:{" "}
                                      <strong>{formatHours(record)}</strong>
                                    </div>

                                    {renderStatusBadge(record, cell)}
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Loading */}

          {loadingHistory && (
            <div className="mt-3 text-center text-xs text-slate-400">
              Loading attendance records...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
