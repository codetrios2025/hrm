import React, { useState, useEffect } from "react";

import {
  CalendarRange,
  Filter,
  Users,
  RefreshCw,
  FileText,
  Download,
  Loader2,
} from "lucide-react";

import api from "../api/client";
import Pagination from "./Pagination";
import { useToast } from "../context/ToastContext";

export default function AdminLeaveHistory() {
  // ============================================================
  // CONSTANTS
  // ============================================================

  const currentDate = new Date();

  const LEAVE_TYPES = [
    {
      key: "paid",
      code: "PL",
      label: "Paid Leave",
      shortLabel: "Paid",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      badge: "bg-emerald-100 text-emerald-700",
    },
    {
      key: "casual",
      code: "CL",
      label: "Casual Leave",
      shortLabel: "Casual",
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-700",
      badge: "bg-blue-100 text-blue-700",
    },
    {
      key: "sick",
      code: "SL",
      label: "Sick Leave",
      shortLabel: "Sick",
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-700",
      badge: "bg-rose-100 text-rose-700",
    },
    {
      key: "oh",
      code: "OH",
      label: "Optional Holiday",
      shortLabel: "Optional",
      bg: "bg-purple-50",
      border: "border-purple-200",
      text: "text-purple-700",
      badge: "bg-purple-100 text-purple-700",
    },
    {
      key: "coff",
      code: "COFF",
      label: "Compensatory Off",
      shortLabel: "COFF",
      bg: "bg-cyan-50",
      border: "border-cyan-200",
      text: "text-cyan-700",
      badge: "bg-cyan-100 text-cyan-700",
    },
    {
      key: "paternity",
      code: "PAT",
      label: "Paternity Leave",
      shortLabel: "Paternity",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-700",
      badge: "bg-indigo-100 text-indigo-700",
    },
    {
      key: "maternity",
      code: "MAT",
      label: "Maternity Leave",
      shortLabel: "Maternity",
      bg: "bg-pink-50",
      border: "border-pink-200",
      text: "text-pink-700",
      badge: "bg-pink-100 text-pink-700",
    },
    {
      key: "bereavement",
      code: "BRV",
      label: "Bereavement Leave",
      shortLabel: "Bereavement",
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-700",
      badge: "bg-orange-100 text-orange-700",
    },
    {
      key: "lwp",
      code: "LWP",
      label: "Leave Without Pay",
      shortLabel: "LWP",
      bg: "bg-slate-50",
      border: "border-slate-300",
      text: "text-slate-700",
      badge: "bg-slate-100 text-slate-700",
    },
  ];

  // ============================================================
  // STATE
  // ============================================================

  const [staffList, setStaffList] = useState([]);

  const [selectedStaff, setSelectedStaff] = useState("all");

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [allMonths, setAllMonths] = useState(false);

  const [records, setRecords] = useState([]);

  const [summary, setSummary] = useState({
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
  });

  const [pagination, setPagination] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const { showError, showSuccess } = useToast();

  // ============================================================
  // API BASE URL
  // ============================================================

  const API_BASE_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
  ).replace(/\/$/, "");

  // ============================================================
  // HELPERS
  // ============================================================

  const getLeaveConfig = (leaveType) => {
    const normalizedType = String(leaveType || "").toLowerCase();

    return (
      LEAVE_TYPES.find((item) => item.key === normalizedType) || {
        key: normalizedType,
        code: normalizedType.toUpperCase() || "-",
        label: normalizedType || "Unknown Leave",
        shortLabel: normalizedType || "Unknown",
        bg: "bg-slate-50",
        border: "border-slate-200",
        text: "text-slate-700",
        badge: "bg-slate-100 text-slate-700",
      }
    );
  };

  const formatLeaveType = (leaveType) => {
    const config = getLeaveConfig(leaveType);

    return `${config.code} - ${config.label}`;
  };

  const formatDate = (date) => {
    if (!date) {
      return "-";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "-";
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateRange = (startDate, endDate) => {
    if (!startDate && !endDate) {
      return "-";
    }

    return `${formatDate(startDate)} → ${formatDate(endDate)}`;
  };

  const getSummaryValue = (key) => {
    return Number(summary?.[key] ?? 0);
  };

  // ============================================================
  // MONTHS
  // ============================================================

  const months = [
    { m: 1, name: "January" },
    { m: 2, name: "February" },
    { m: 3, name: "March" },
    { m: 4, name: "April" },
    { m: 5, name: "May" },
    { m: 6, name: "June" },
    { m: 7, name: "July" },
    { m: 8, name: "August" },
    { m: 9, name: "September" },
    { m: 10, name: "October" },
    { m: 11, name: "November" },
    { m: 12, name: "December" },
  ];

  // ============================================================
  // LOAD STAFF
  // ============================================================

  useEffect(() => {
    const fetchStaffOptions = async () => {
      try {
        const res = await api.get("/admin/staff?limit=1000");

        const responseData = res?.data || {};

        const staff =
          responseData?.staff ||
          responseData?.data?.staff ||
          responseData?.data ||
          [];

        setStaffList(Array.isArray(staff) ? staff : []);
      } catch (err) {
        console.error("Fetch staff options error:", err);

        showError(err?.message || "Unable to load employee list");
      }
    };

    fetchStaffOptions();
  }, []);

  // ============================================================
  // FETCH LEAVE HISTORY
  // ============================================================

  const fetchLeaveHistory = async (page = 1) => {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", "5");
      params.set("year", String(selectedYear));
      params.set("employeeId", selectedStaff);

      if (!allMonths) {
        params.set("month", String(selectedMonth));
      }

      const res = await api.get(`/admin/leave-history?${params.toString()}`);

      const responseData = res?.data || {};

      const data = responseData?.data || responseData;

      setRecords(Array.isArray(data?.records) ? data.records : []);

      setSummary({
        total: Number(data?.summary?.total ?? 0),
        paid: Number(data?.summary?.paid ?? 0),
        casual: Number(data?.summary?.casual ?? 0),
        sick: Number(data?.summary?.sick ?? 0),
        oh: Number(data?.summary?.oh ?? 0),
        coff: Number(data?.summary?.coff ?? 0),
        paternity: Number(data?.summary?.paternity ?? 0),
        maternity: Number(data?.summary?.maternity ?? 0),
        bereavement: Number(data?.summary?.bereavement ?? 0),
        lwp: Number(data?.summary?.lwp ?? 0),
      });

      setPagination(data?.pagination || null);

      setCurrentPage(page);
    } catch (err) {
      console.error("Fetch leave history error:", err);

      showError(err?.message || "Unable to load leave history");

      setRecords([]);

      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOAD DATA WHEN FILTER CHANGES
  // ============================================================

  useEffect(() => {
    fetchLeaveHistory(1);
  }, [selectedStaff, selectedMonth, selectedYear, allMonths]);

  // ============================================================
  // DOWNLOAD LEAVE HISTORY CSV
  // ============================================================

  const handleDownloadLeaveReport = async () => {
    if (downloading) {
      return;
    }

    setDownloading(true);

    try {
      const params = new URLSearchParams();

      params.set("employeeId", selectedStaff || "all");

      params.set("year", String(selectedYear));

      if (allMonths) {
        params.set("allMonths", "true");
      } else {
        params.set("month", String(selectedMonth));

        params.set("allMonths", "false");
      }

      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Authentication token not found. Please login again.");
      }

      const url =
        `${API_BASE_URL}/admin/export-leave-history?` + params.toString();

      console.log("Downloading leave report:", url);

      // ========================================================
      // IMPORTANT:
      // Use native fetch() for CSV download.
      // This avoids any response interceptor from api/client.
      // ========================================================

      const response = await fetch(url, {
        method: "GET",

        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/csv",
        },
      });

      // ========================================================
      // HANDLE SERVER ERROR
      // ========================================================

      if (!response.ok) {
        let errorMessage = `Failed to download report (${response.status})`;

        try {
          const contentType = response.headers.get("content-type") || "";

          if (contentType.includes("application/json")) {
            const errorData = await response.json();

            errorMessage =
              errorData?.message || errorData?.error || errorMessage;
          } else {
            const errorText = await response.text();

            if (errorText) {
              errorMessage = errorText;
            }
          }
        } catch (parseError) {
          console.error("Error parsing download error:", parseError);
        }

        throw new Error(errorMessage);
      }

      // ========================================================
      // GET CSV AS BLOB
      // ========================================================

      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error("No report file received from server");
      }

      // ========================================================
      // CREATE DOWNLOAD URL
      // ========================================================

      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = blobUrl;

      // ========================================================
      // FILE NAME
      // ========================================================

      const employeePart =
        selectedStaff === "all" ? "all-employees" : selectedStaff;

      const periodPart = allMonths
        ? `${selectedYear}-full-year`
        : `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

      link.download = `Leave_History_Report_${employeePart}_${periodPart}.csv`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      // Give browser a little time before cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);

      showSuccess("Leave history report downloaded successfully!");
    } catch (err) {
      console.error("Leave report download error:", err);

      showError(err?.message || "Unable to download leave history report");
    } finally {
      setDownloading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-5">
      {/* ============================================================
          HEADER
      ============================================================ */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-indigo-600" />

          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Employee Leave History
            </h2>

            <p className="text-xs text-slate-500">
              View approved leave usage for all 9 leave types
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}

          <button
            type="button"
            onClick={() => fetchLeaveHistory(1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          {/* Download CSV */}

          <button
            type="button"
            onClick={handleDownloadLeaveReport}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:bg-emerald-400 disabled:cursor-not-allowed shadow-sm"
          >
            {downloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Download Leave History
              </>
            )}
          </button>
        </div>
      </div>

      {/* ============================================================
          FILTER BAR
      ============================================================ */}

      <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {/* Employee */}

          <div>
            <label className="block text-slate-500 mb-1 font-medium">
              Select Employee
            </label>

            <div className="relative">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />

              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full border rounded p-2 pl-8 bg-white text-slate-800 font-medium focus:outline-indigo-500"
              >
                <option value="all">All Staff Members</option>

                {staffList.map((st) => (
                  <option key={st._id} value={st._id}>
                    {st.name} ({st.employeeId || st.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Month */}

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-500 font-medium">Month</label>

              <label className="text-[10px] text-indigo-600 flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allMonths}
                  onChange={(e) => setAllMonths(e.target.checked)}
                  className="rounded"
                />
                Entire Year
              </label>
            </div>

            <select
              disabled={allMonths}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full border rounded p-2 bg-white text-slate-800 font-medium disabled:opacity-50 focus:outline-indigo-500"
            >
              {months.map((item) => (
                <option key={item.m} value={item.m}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}

          <div>
            <label className="block text-slate-500 mb-1 font-medium">
              Year
            </label>

            <input
              type="number"
              min="2020"
              max="2050"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full border rounded p-2 bg-white text-slate-800 font-medium focus:outline-indigo-500"
            />
          </div>

          {/* Apply */}

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fetchLeaveHistory(1)}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2 rounded transition"
            >
              <Filter className="w-3.5 h-3.5" />

              <span>{loading ? "Loading..." : "Apply Filters"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          SUMMARY
      ============================================================ */}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-slate-500" />

          <h3 className="text-sm font-semibold text-slate-700">
            Leave Usage Summary
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-2 text-xs">
          {/* TOTAL */}

          <div className="bg-slate-900 text-white p-3 rounded-lg flex flex-col justify-between min-h-[78px]">
            <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              Total Taken
            </span>

            <span className="text-xl font-bold mt-1">
              {getSummaryValue("total")}
            </span>

            <span className="text-[10px] text-slate-400">Days</span>
          </div>

          {/* ALL LEAVE TYPES */}

          {LEAVE_TYPES.map((leaveType) => (
            <div
              key={leaveType.key}
              className={`${leaveType.bg} border ${leaveType.border} p-3 rounded-lg flex flex-col justify-between min-h-[78px]`}
            >
              <span
                className={`${leaveType.text} uppercase tracking-wider text-[10px] font-semibold`}
              >
                {leaveType.code}
              </span>

              <span className={`text-xl font-bold mt-1 ${leaveType.text}`}>
                {getSummaryValue(leaveType.key)}
              </span>

              <span className={`text-[10px] ${leaveType.text}`}>
                {leaveType.shortLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================
          SUMMARY BADGE BAR
      ============================================================ */}

      <div className="flex flex-wrap gap-2">
        {LEAVE_TYPES.map((leaveType) => (
          <span
            key={leaveType.key}
            className={`${leaveType.badge} px-3 py-1 rounded-full border ${leaveType.border} text-[10px] font-semibold`}
          >
            {leaveType.code}: {getSummaryValue(leaveType.key)}
          </span>
        ))}
      </div>

      {/* ============================================================
          TABLE
      ============================================================ */}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                <th className="p-3 font-semibold">Employee</th>

                <th className="p-3 font-semibold">Leave Type</th>

                <th className="p-3 font-semibold">Date Range</th>

                <th className="p-3 font-semibold">Days</th>

                <th className="p-3 font-semibold">Reason</th>

                <th className="p-3 font-semibold">Approved By</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {records.map((item) => {
                const leaveConfig = getLeaveConfig(item.leaveType);

                return (
                  <tr
                    key={item._id}
                    className="text-slate-700 hover:bg-slate-50/70 transition"
                  >
                    {/* Employee */}

                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-semibold">
                          {(item.userId?.name || "U").charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <div className="font-semibold text-slate-800">
                            {item.userId?.name || "Unknown"}
                          </div>

                          <span className="block text-[10px] text-slate-400 font-mono">
                            {item.userId?.employeeId ||
                              item.userId?.email ||
                              "-"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Leave Type */}

                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${leaveConfig.badge}`}
                        >
                          {leaveConfig.code}
                        </span>

                        <span className="text-[10px] text-slate-500">
                          {leaveConfig.label}
                        </span>
                      </div>
                    </td>

                    {/* Date */}

                    <td className="p-3 font-medium whitespace-nowrap">
                      {formatDateRange(item.startDate, item.endDate)}
                    </td>

                    {/* Days */}

                    <td className="p-3">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-md bg-slate-100 text-slate-800 font-bold">
                        {item.daysCount ?? item.days ?? 0}
                      </span>
                    </td>

                    {/* Reason */}

                    <td className="p-3 max-w-[260px]">
                      <div
                        className="truncate text-slate-600"
                        title={item.reason || "-"}
                      >
                        {item.reason || "-"}
                      </div>
                    </td>

                    {/* Approved By */}

                    <td className="p-3 text-slate-600">
                      <div>
                        <span className="font-medium">
                          {item.reviewedBy?.name || "Admin"}
                        </span>

                        {item.reviewedBy?.email && (
                          <span className="block text-[10px] text-slate-400">
                            {item.reviewedBy.email}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* EMPTY */}

              {records.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CalendarRange className="w-8 h-8 text-slate-300" />

                      <span className="font-medium">
                        {loading
                          ? "Loading leave history..."
                          : "No approved leaves found"}
                      </span>

                      {!loading && (
                        <span className="text-[11px]">
                          Try changing the employee, month, or year filter.
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          PAGINATION
      ============================================================ */}

      <Pagination
        pagination={pagination}
        onPageChange={(page) => fetchLeaveHistory(page)}
      />
    </div>
  );
}
