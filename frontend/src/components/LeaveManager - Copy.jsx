import React, { useState, useEffect } from "react";
import { Calendar, Check, X, FileText, Ban } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Pagination from "./Pagination";

export default function LeaveManager() {
  const { user, refreshUser } = useAuth();
  const isApprover = user?.role === "manager" || user?.role === "admin";

  const [leaves, setLeaves] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    leaveType: "paid",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [activeReason, setActiveReason] = useState(null);

  // Reject Modal State
  const [rejectModal, setRejectModal] = useState({
    open: false,
    leaveId: null,
    reason: "",
  });

  const { showSuccess, showError } = useToast();

  const fetchLeaves = async (page = 1) => {
    try {
      const endpoint = isApprover ? "/leaves/all" : "/leaves/my-leaves";
      const res = await api.get(`${endpoint}?page=${page}&limit=5`);
      setLeaves(res.data.leaves || []);
      setPagination(res.data.pagination);
      setCurrentPage(page);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLeaves(currentPage);
  }, [user?.role, currentPage]);

  const handleApply = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/leaves/apply", formData);
      showSuccess(res.message || "Leave application submitted successfully!");
      setFormData({
        leaveType: "paid",
        startDate: "",
        endDate: "",
        reason: "",
      });
      await fetchLeaves(1);
      if (refreshUser) await refreshUser();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      const res = await api.patch(`/leaves/${id}/review`, {
        status: "approved",
      });
      showSuccess(res.message || "Leave request approved");
      await fetchLeaves(currentPage);
      if (refreshUser) await refreshUser();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleConfirmReject = async (e) => {
    e.preventDefault();
    try {
      const res = await api.patch(`/leaves/${rejectModal.leaveId}/review`, {
        status: "rejected",
        rejectionReason: rejectModal.reason || "Rejected by approver",
      });
      showSuccess(res.message || "Leave request rejected and balance refunded");
      setRejectModal({ open: false, leaveId: null, reason: "" });
      await fetchLeaves(currentPage);
      if (refreshUser) await refreshUser();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleCancelLeave = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this leave application? The deducted days will be refunded to your balance.",
    );
    if (!confirmed) return;

    try {
      const res = await api.patch(`/leaves/${id}/cancel`);
      showSuccess(res.message || "Leave cancelled and balance refunded");
      await fetchLeaves(currentPage);
      if (refreshUser) await refreshUser();
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            Leave Management
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
            Paid: {user?.leaveBalance?.paid ?? 0}
          </span>
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
            Casual: {user?.leaveBalance?.casual ?? 0}
          </span>
          <span className="bg-rose-50 text-rose-700 px-3 py-1 rounded-full border border-rose-200">
            Sick: {user?.leaveBalance?.sick ?? 0}
          </span>
          <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
            Optional Holiday: {user?.leaveBalance?.oh ?? 2}
          </span>
        </div>
      </div>

      {/* Apply Leave Form */}
      <form
        onSubmit={handleApply}
        className="bg-slate-50 p-4 rounded-lg mb-6 text-sm border border-slate-200"
      >
        <h3 className="font-semibold text-xs text-slate-700 mb-3 uppercase tracking-wider">
          Apply for Leave
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Leave Type
            </label>
            <select
              value={formData.leaveType}
              onChange={(e) =>
                setFormData({ ...formData, leaveType: e.target.value })
              }
              className="w-full border rounded p-2 bg-white text-slate-800"
            >
              <option value="paid">Paid Leave</option>
              <option value="casual">Casual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="oh">Optional Holiday (OH)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Start Date
            </label>
            <input
              type="date"
              required
              value={formData.startDate}
              onChange={(e) =>
                setFormData({ ...formData, startDate: e.target.value })
              }
              className="w-full border rounded p-2 bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              End Date
            </label>
            <input
              type="date"
              required
              value={formData.endDate}
              onChange={(e) =>
                setFormData({ ...formData, endDate: e.target.value })
              }
              className="w-full border rounded p-2 bg-white"
            />
          </div>
        </div>
        <div className="mb-3">
          <input
            type="text"
            required
            placeholder="Reason for leave"
            value={formData.reason}
            onChange={(e) =>
              setFormData({ ...formData, reason: e.target.value })
            }
            className="w-full border rounded p-2 bg-white"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded transition text-sm disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Leave Request"}
        </button>
      </form>

      {/* Leave Requests Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              {isApprover && <th className="pb-2">Applicant</th>}
              <th className="pb-2">Type</th>
              <th className="pb-2">Date Range</th>
              <th className="pb-2">Days</th>
              <th className="pb-2">Reason</th>
              <th className="pb-2">Status</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leaves.map((l) => (
              <tr key={l._id} className="text-slate-700 hover:bg-slate-50/50">
                {isApprover && (
                  <td className="py-2.5 font-medium">
                    {l.userId?.name || "Unknown"}
                    <span className="block text-[10px] text-slate-400">
                      {l.userId?.email}
                    </span>
                  </td>
                )}
                <td className="py-2.5 capitalize font-medium">
                  {l.leaveType === "oh" ? "Optional Holiday" : l.leaveType}
                </td>
                <td className="py-2.5">
                  {l.startDate.slice(0, 10)} → {l.endDate.slice(0, 10)}
                </td>
                <td className="py-2.5 font-semibold">{l.daysCount}</td>
                <td className="py-2.5 max-w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-slate-600" title={l.reason}>
                      {l.reason}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveReason({
                          user: l.userId?.name || "Self",
                          reason: l.reason,
                          type: l.leaveType,
                          rejectionReason: l.rejectionReason,
                        })
                      }
                      className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded shrink-0"
                      title="View Reason"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      l.status === "approved"
                        ? "bg-emerald-100 text-emerald-700"
                        : l.status === "rejected"
                          ? "bg-rose-100 text-rose-700"
                          : l.status === "cancelled"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {l.status}
                  </span>
                </td>

                {/* Actions: Manager Review OR Employee Self-Cancel */}
                <td className="py-2.5 text-right space-x-1 whitespace-nowrap">
                  {isApprover && l.status === "pending" ? (
                    <>
                      <button
                        onClick={() => handleApprove(l._id)}
                        className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                        title="Approve"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setRejectModal({
                            open: true,
                            leaveId: l._id,
                            reason: "",
                          })
                        }
                        className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                        title="Reject & Refund"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : !isApprover && l.status === "pending" ? (
                    <button
                      onClick={() => handleCancelLeave(l._id)}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 rounded text-[10px] font-semibold transition"
                      title="Cancel Request & Refund Days"
                    >
                      <Ban className="w-3 h-3" />
                      <span>Cancel</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">--</span>
                  )}
                </td>
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr>
                <td
                  colSpan={isApprover ? 7 : 6}
                  className="py-4 text-center text-slate-400"
                >
                  No records to display
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        pagination={pagination}
        onPageChange={(p) => setCurrentPage(p)}
      />

      {/* Modal: View Reason */}
      {activeReason && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">
                Leave Reason:{" "}
                <span className="text-indigo-600">{activeReason.user}</span>
              </h3>
              <button
                onClick={() => setActiveReason(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-2">
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {activeReason.type === "oh"
                  ? "Optional Holiday"
                  : activeReason.type}{" "}
                Leave
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed max-h-40 overflow-y-auto break-words">
              {activeReason.reason}
            </div>

            {activeReason.rejectionReason && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                <span className="font-semibold block mb-1">
                  Rejection Remark:
                </span>
                {activeReason.rejectionReason}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setActiveReason(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Confirmation & Remark */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">
                Reject Leave Request
              </h3>
              <button
                onClick={() =>
                  setRejectModal({ open: false, leaveId: null, reason: "" })
                }
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Rejection Reason / Remark
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Critical project milestone in this duration"
                  className="w-full border rounded p-2 text-slate-800 resize-none"
                  value={rejectModal.reason}
                  onChange={(e) =>
                    setRejectModal({ ...rejectModal, reason: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() =>
                    setRejectModal({ open: false, leaveId: null, reason: "" })
                  }
                  className="px-3 py-1.5 border rounded text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium"
                >
                  Confirm Rejection &amp; Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
