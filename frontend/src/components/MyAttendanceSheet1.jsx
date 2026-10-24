import React, { useState, useEffect } from "react";
import { CalendarDays, Eye } from "lucide-react";
import api from "../api/client";
import Pagination from "./Pagination";
import { useToast } from "../context/ToastContext";

export default function MyAttendanceSheet() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const { showError } = useToast();

  const fetchHistory = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get(
        `/attendance/my-history?page=${page}&limit=5&month=${month}&year=${year}`,
      );
      setRecords(res.data.records);
      setPagination(res.data.pagination);
      setCurrentPage(page);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(1);
  }, [month, year]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "in-progress":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      case "present":
        return "bg-emerald-100 text-emerald-800 border border-emerald-200";
      case "short-leave":
        return "bg-indigo-100 text-indigo-800 border border-indigo-200";
      case "half-day":
        return "bg-amber-100 text-amber-800 border border-amber-200";
      case "absent":
        return "bg-rose-100 text-rose-800 border border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  const formatStatusText = (status) => {
    if (status === "in-progress") return "In Progress";
    if (status === "present") return "Full Day";
    if (status === "short-leave") return "Short Leave";
    if (status === "half-day") return "Half Day";
    if (status === "absent") return "Absent (< 5 hrs)";
    return status;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div className="flex items-center space-x-2">
          <CalendarDays className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            My Attendance Sheet
          </h2>
          <span className="text-[11px] bg-slate-100 text-slate-500 font-medium px-2 py-0.5 rounded flex items-center gap-1">
            <Eye className="w-3 h-3" /> Read-Only
          </span>
        </div>

        {/* Month & Year Selectors */}
        <div className="flex items-center gap-2 text-xs">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border rounded p-1.5 bg-white text-slate-800 font-medium focus:outline-indigo-500"
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

          <input
            type="number"
            min="2020"
            max="2050"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-20 border rounded p-1.5 bg-white text-slate-800 font-medium focus:outline-indigo-500"
          />
        </div>
      </div>

      {/* Read-Only Attendance Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
              <th className="p-3">Date</th>
              <th className="p-3">Clock In</th>
              <th className="p-3">Clock Out</th>
              <th className="p-3">Total Duration</th>
              <th className="p-3 text-right">Day Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => (
              <tr key={r._id} className="text-slate-700 hover:bg-slate-50/50">
                <td className="p-3 font-semibold text-slate-800">{r.date}</td>
                <td className="p-3">
                  {r.clockIn
                    ? new Date(r.clockIn).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "--:--"}
                </td>
                <td className="p-3">
                  {r.clockOut
                    ? new Date(r.clockOut).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "--:--"}
                </td>
                <td className="p-3 font-medium">
                  {r.totalHours ? `${r.totalHours} hrs` : "--"}
                </td>
                <td className="p-3 text-right">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(r.status)}`}
                  >
                    {formatStatusText(r.status)}
                  </span>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  {loading
                    ? "Fetching attendance logs..."
                    : "No attendance logs recorded for this month."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        pagination={pagination}
        onPageChange={(p) => fetchHistory(p)}
      />
    </div>
  );
}
