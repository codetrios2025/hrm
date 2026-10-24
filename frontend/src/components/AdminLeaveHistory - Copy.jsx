import React, { useState, useEffect } from "react";
import { CalendarRange, Filter, Users } from "lucide-react";
import api from "../api/client";
import Pagination from "./Pagination";
import { useToast } from "../context/ToastContext";

export default function AdminLeaveHistory() {
  const currentDate = new Date();
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
    casual: 0,
    paid: 0,
    sick: 0,
    oh: 0,
  });
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const { showError } = useToast();

  // Load staff members for dropdown filter
  useEffect(() => {
    const fetchStaffOptions = async () => {
      try {
        const res = await api.get("/admin/staff?limit=100");
        setStaffList(res.data.staff || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStaffOptions();
  }, []);

  const fetchLeaveHistory = async (page = 1) => {
    setLoading(true);
    try {
      let query = `/admin/leave-history?page=${page}&limit=10&year=${selectedYear}&employeeId=${selectedStaff}`;
      if (!allMonths) {
        query += `&month=${selectedMonth}`;
      }

      const res = await api.get(query);
      setRecords(res.data.records);
      setSummary(res.data.summary);
      setPagination(res.data.pagination);
      setCurrentPage(page);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveHistory(1);
  }, [selectedStaff, selectedMonth, selectedYear, allMonths]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <CalendarRange className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            Employee Leave History
          </h2>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-500 mb-1 font-medium">
              Select Employee
            </label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full border rounded p-2 bg-white text-slate-800 font-medium focus:outline-indigo-500"
            >
              <option value="all">All Staff Members</option>
              {staffList.map((st) => (
                <option key={st._id} value={st._id}>
                  {st.name} ({st.employeeId || st.email})
                </option>
              ))}
            </select>
          </div>

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
              {[
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
              ].map((item) => (
                <option key={item.m} value={item.m}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

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

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fetchLeaveHistory(1)}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded transition"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Breakdown Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
        <div className="bg-slate-900 text-white p-3 rounded-lg flex flex-col justify-between">
          <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
            Total Taken
          </span>
          <span className="text-xl font-bold mt-1">{summary.total} Days</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-blue-600 uppercase tracking-wider text-[10px] font-semibold">
            Casual Leave (CL)
          </span>
          <span className="text-xl font-bold mt-1 text-blue-700">
            {summary.casual} Days
          </span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-emerald-600 uppercase tracking-wider text-[10px] font-semibold">
            Paid Leave (PL)
          </span>
          <span className="text-xl font-bold mt-1 text-emerald-700">
            {summary.paid} Days
          </span>
        </div>
        <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-rose-600 uppercase tracking-wider text-[10px] font-semibold">
            Sick Leave (SL)
          </span>
          <span className="text-xl font-bold mt-1 text-rose-700">
            {summary.sick} Days
          </span>
        </div>
        <div className="bg-purple-50 border border-purple-200 text-purple-900 p-3 rounded-lg flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-purple-600 uppercase tracking-wider text-[10px] font-semibold">
            Optional (OH)
          </span>
          <span className="text-xl font-bold mt-1 text-purple-700">
            {summary.oh} Days
          </span>
        </div>
      </div>

      {/* Leave Details Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
              <th className="p-3">Employee</th>
              <th className="p-3">Type</th>
              <th className="p-3">Date Range</th>
              <th className="p-3">Days</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Approved By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((item) => (
              <tr
                key={item._id}
                className="text-slate-700 hover:bg-slate-50/50"
              >
                <td className="p-3 font-medium">
                  {item.userId?.name || "Unknown"}
                  <span className="block text-[10px] text-slate-400 font-mono">
                    {item.userId?.employeeId || item.userId?.email}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      item.leaveType === "casual"
                        ? "bg-blue-100 text-blue-700"
                        : item.leaveType === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : item.leaveType === "sick"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {item.leaveType === "oh" ? "OH" : item.leaveType}
                  </span>
                </td>
                <td className="p-3 font-medium">
                  {item.startDate.slice(0, 10)} → {item.endDate.slice(0, 10)}
                </td>
                <td className="p-3 font-bold text-slate-800">
                  {item.daysCount}
                </td>
                <td className="p-3 max-w-[200px] truncate" title={item.reason}>
                  {item.reason}
                </td>
                <td className="p-3 text-slate-600">
                  {item.reviewedBy?.name || "Admin"}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  {loading
                    ? "Calculating leave metrics..."
                    : "No approved leaves found matching these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        pagination={pagination}
        onPageChange={(p) => fetchLeaveHistory(p)}
      />
    </div>
  );
}
