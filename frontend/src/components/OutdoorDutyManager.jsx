import React, { useState, useEffect } from "react";
import { Briefcase, CheckCircle, XCircle, Clock } from "lucide-react";
import api from "../api/client";
import Pagination from "./Pagination";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

export default function OutdoorDutyManager() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [odList, setOdList] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    startTime: "09:30",
    endTime: "18:30",
    location: "",
    reason: "",
  });

  const fetchODs = async (page = 1) => {
    try {
      const res = await api.get(`/outdoor-duty?page=${page}&limit=5`);

      // Handle ApiResponse wrapper: res.data.data or res.data
      const payload = res.data?.data !== undefined ? res.data.data : res.data;

      if (payload && payload.records) {
        setOdList(payload.records);
        setPagination(payload.pagination);
      } else if (Array.isArray(payload)) {
        // Fallback if backend returns an array
        setOdList(payload.slice((page - 1) * 5, page * 5));
        setPagination({
          total: payload.length,
          page,
          limit: 5,
          totalPages: Math.ceil(payload.length / 5),
        });
      }
      setCurrentPage(page);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchODs(currentPage);
  }, [currentPage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/outdoor-duty", form);
      showSuccess(res.message || "OD Application submitted!");
      setForm({
        date: new Date().toISOString().split("T")[0],
        startTime: "09:30",
        endTime: "18:30",
        location: "",
        reason: "",
      });
      fetchODs(1);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatus = async (id, action) => {
    try {
      const res = await api.patch(`/outdoor-duty/${id}/${action}`);
      showSuccess(res.message || `OD ${action} successfully`);
      fetchODs(currentPage);
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Apply Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-800">
            Apply for On-Duty (OD)
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-medium">
                Duty Date
              </label>
              <input
                type="date"
                required
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-medium">
                Start Time (Clock In)
              </label>
              <input
                type="time"
                required
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.startTime}
                onChange={(e) =>
                  setForm({ ...form, startTime: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-medium">
                End Time (Clock Out)
              </label>
              <input
                type="time"
                required
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1 font-medium">
                Client / Site Location
              </label>
              <input
                type="text"
                placeholder="e.g. Client Office, Connaught Place, Delhi"
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-medium">
                Reason / Task Description
              </label>
              <input
                type="text"
                required
                placeholder="e.g. ERP deployment and client meeting"
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition shadow-sm"
            >
              {loading ? "Submitting..." : "Submit OD Request"}
            </button>
          </div>
        </form>
      </div>

      {/* History Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">
          On-Duty Applications
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500">
                {user.role === "admin" && <th className="p-3">Staff</th>}
                <th className="p-3">Date</th>
                <th className="p-3">Timings</th>
                <th className="p-3">Location & Reason</th>
                <th className="p-3">Status</th>
                {user.role === "admin" && (
                  <th className="p-3 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {odList.map((od) => (
                <tr key={od._id}>
                  {user.role === "admin" && (
                    <td className="p-3 font-medium">
                      {od.userId?.name || "Staff"}
                      <span className="block text-[10px] text-slate-400">
                        {od.userId?.employeeId}
                      </span>
                    </td>
                  )}
                  <td className="p-3 font-mono">{od.date}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      <Clock className="w-3 h-3" />
                      {od.startTime || "09:30"} - {od.endTime || "18:30"}
                    </span>
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{od.location || "N/A"}</p>
                    <p className="text-[11px] text-slate-400">{od.reason}</p>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        od.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : od.status === "rejected"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {od.status}
                    </span>
                  </td>
                  {user.role === "admin" && (
                    <td className="p-3 text-right">
                      {od.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleStatus(od._id, "approve")}
                            className="px-2.5 py-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded font-medium inline-flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleStatus(od._id, "reject")}
                            className="px-2.5 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded font-medium inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">
                          Processed
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {odList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">
                    No On-Duty requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Control */}
        <Pagination
          pagination={pagination}
          onPageChange={(p) => setCurrentPage(p)}
        />
      </div>
    </div>
  );
}
