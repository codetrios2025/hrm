import React, { useState, useEffect } from "react";
import { Calendar, UserCheck, X } from "lucide-react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";

export default function AdminLeaveGrantModal({ onClose }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    userId: "",
    leaveType: "paid",
    startDate: "",
    halfDaySession: "first",
    reason: "Administrative adjustment",
  });
  const [loading, setLoading] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await api.get("/admin/users"); // Adjust to your staff list endpoint
        setEmployees(res.data?.data || res.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStaff();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/leaves/admin/grant-half-day", form);
      showSuccess(
        res.message || "Half-day leave successfully granted to employee!",
      );
      onClose();
    } catch (err) {
      showError(err.message || "Failed to grant half-day leave");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm text-xs">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">
              HR Admin: Grant Half-Day Leave
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Select Employee *
            </label>
            <select
              required
              className="w-full border rounded-lg p-2 bg-white text-slate-800"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">-- Choose Staff Member --</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.email})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                Leave Type *
              </label>
              <select
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.leaveType}
                onChange={(e) =>
                  setForm({ ...form, leaveType: e.target.value })
                }
              >
                <option value="paid">Paid Leave (PL)</option>
                <option value="casual">Casual Leave (CL)</option>
                <option value="sick">Sick Leave (SL)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">
                Session *
              </label>
              <select
                className="w-full border rounded-lg p-2 bg-white text-slate-800"
                value={form.halfDaySession}
                onChange={(e) =>
                  setForm({ ...form, halfDaySession: e.target.value })
                }
              >
                <option value="first">First Half (Morning)</option>
                <option value="second">Second Half (Afternoon)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Leave Date *
            </label>
            <input
              type="date"
              required
              className="w-full border rounded-lg p-2 bg-white text-slate-800"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Reason / Note *
            </label>
            <input
              type="text"
              required
              className="w-full border rounded-lg p-2 bg-white text-slate-800"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition shadow-sm disabled:opacity-50"
            >
              {loading ? "Granting..." : "Grant Half-Day (0.5)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
