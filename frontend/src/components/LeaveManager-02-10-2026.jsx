import React, { useEffect, useState } from "react";
import { Calendar, Check, X, FileText, Ban, AlertCircle } from "lucide-react";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Pagination from "./Pagination";

export default function LeaveManager() {
  const { user, refreshUser } = useAuth();

  const isApprover = user?.role === "manager" || user?.role === "admin";

  // ============================================================
  // STATE
  // ============================================================

  const [leaves, setLeaves] = useState([]);
  const [pagination, setPagination] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  const [activeReason, setActiveReason] = useState(null);

  const [rejectModal, setRejectModal] = useState({
    open: false,
    leaveId: null,
    reason: "",
  });

  const [formData, setFormData] = useState({
    leaveType: "paid",
    startDate: "",
    endDate: "",
    reason: "",
  });

  // ============================================================
  // TOAST
  // ============================================================

  const { showSuccess, showError } = useToast();

  // ============================================================
  // LEAVE BALANCE
  // ============================================================

  const leaveBalance = user?.leaveBalance || {};

  // ============================================================
  // GET LEAVES
  // ============================================================

  const fetchLeaves = async (page = 1) => {
    try {
      setListLoading(true);

      const endpoint = isApprover ? "/leaves/all" : "/leaves/my-leaves";

      const res = await api.get(endpoint + "?page=" + page + "&limit=5");

      const responseData = res?.data || {};

      // Supports both:
      // res.data.leaves
      // and
      // res.data.data.leaves

      const data = responseData?.data || responseData;

      setLeaves(data?.leaves || []);
      setPagination(data?.pagination || null);
      setCurrentPage(page);
    } catch (err) {
      console.error("Fetch leaves error:", err);

      showError(err?.message || "Unable to load leave requests");
    } finally {
      setListLoading(false);
    }
  };

  // ============================================================
  // INITIAL LOAD / ROLE CHANGE / PAGE CHANGE
  // ============================================================

  useEffect(() => {
    if (user) {
      fetchLeaves(currentPage);
    }
  }, [user?.role, currentPage]);

  // ============================================================
  // FORM CHANGE
  // ============================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // ============================================================
  // CALCULATE DAYS
  // ============================================================

  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) {
      return 0;
    }

    const start = new Date(formData.startDate);

    const end = new Date(formData.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }

    const diffTime = end.getTime() - start.getTime();

    if (diffTime < 0) {
      return 0;
    }

    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // ============================================================
  // APPLY LEAVE
  // ============================================================

  const handleApply = async (e) => {
    e.preventDefault();

    // ----------------------------------------------------------
    // Validation
    // ----------------------------------------------------------

    if (!formData.leaveType) {
      showError("Please select a leave type");
      return;
    }

    if (!formData.startDate) {
      showError("Please select start date");
      return;
    }

    if (!formData.endDate) {
      showError("Please select end date");
      return;
    }

    if (!formData.reason.trim()) {
      showError("Please enter reason for leave");
      return;
    }

    if (formData.startDate > formData.endDate) {
      showError("Start date cannot be after end date");
      return;
    }

    const daysCount = calculateDays();

    if (daysCount <= 0) {
      showError("Invalid leave date range");
      return;
    }

    // ----------------------------------------------------------
    // Balance validation
    // ----------------------------------------------------------

    if (formData.leaveType !== "lwp") {
      const balance = Number(leaveBalance[formData.leaveType] ?? 0);

      if (balance < daysCount) {
        showError(
          "Insufficient leave balance. You have " +
            balance +
            " day(s) available but requested " +
            daysCount +
            " day(s).",
        );

        return;
      }
    }

    try {
      setLoading(true);

      const res = await api.post("/leaves/apply", formData);

      showSuccess(res?.message || "Leave application submitted successfully!");

      // --------------------------------------------------------
      // Reset form
      // --------------------------------------------------------

      setFormData({
        leaveType: "paid",
        startDate: "",
        endDate: "",
        reason: "",
      });

      // --------------------------------------------------------
      // Refresh leave list
      // --------------------------------------------------------

      await fetchLeaves(1);

      // --------------------------------------------------------
      // Refresh logged-in user
      // --------------------------------------------------------

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Apply leave error:", err);

      showError(err?.message || "Unable to submit leave application");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // APPROVE LEAVE
  // ============================================================

  const handleApprove = async (id) => {
    if (!id) {
      showError("Invalid leave request");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to approve this leave request?",
    );

    if (!confirmed) {
      return;
    }

    try {
      const res = await api.patch("/leaves/" + id + "/review", {
        status: "approved",
      });

      showSuccess(res?.message || "Leave request approved successfully");

      await fetchLeaves(currentPage);

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Approve leave error:", err);

      showError(err?.message || "Unable to approve leave request");
    }
  };

  // ============================================================
  // OPEN REJECT MODAL
  // ============================================================

  const openRejectModal = (id) => {
    if (!id) {
      showError("Invalid leave request");
      return;
    }

    setRejectModal({
      open: true,
      leaveId: id,
      reason: "",
    });
  };

  // ============================================================
  // CLOSE REJECT MODAL
  // ============================================================

  const closeRejectModal = () => {
    setRejectModal({
      open: false,
      leaveId: null,
      reason: "",
    });
  };

  // ============================================================
  // CONFIRM REJECTION
  // ============================================================

  const handleConfirmReject = async (e) => {
    e.preventDefault();

    if (!rejectModal.leaveId) {
      showError("Invalid leave request");
      return;
    }

    const rejectionReason = rejectModal.reason.trim();

    if (!rejectionReason) {
      showError("Please enter a rejection reason");
      return;
    }

    try {
      const res = await api.patch(
        "/leaves/" + rejectModal.leaveId + "/review",
        {
          status: "rejected",
          rejectionReason,
        },
      );

      showSuccess(
        res?.message || "Leave request rejected and balance refunded",
      );

      closeRejectModal();

      await fetchLeaves(currentPage);

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Reject leave error:", err);

      showError(err?.message || "Unable to reject leave request");
    }
  };

  // ============================================================
  // CANCEL LEAVE
  // ============================================================

  const handleCancelLeave = async (id) => {
    if (!id) {
      showError("Invalid leave request");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this leave application?\n\nThe deducted days will be refunded to your balance.",
    );

    if (!confirmed) {
      return;
    }

    try {
      const res = await api.patch("/leaves/" + id + "/cancel");

      showSuccess(res?.message || "Leave cancelled and balance refunded");

      await fetchLeaves(currentPage);

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Cancel leave error:", err);

      showError(err?.message || "Unable to cancel leave request");
    }
  };

  // ============================================================
  // FORMAT LEAVE TYPE
  // ============================================================

  const formatLeaveType = (type) => {
    const types = {
      paid: "Paid Leave (PL)",
      casual: "Casual Leave (CL)",
      sick: "Sick Leave (SL)",
      oh: "Optional Holiday (OH)",
      coff: "Compensatory Off (COFF)",
      maternity: "Maternity Leave",
      paternity: "Paternity Leave",
      bereavement: "Bereavement Leave",
      lwp: "Leave Without Pay (LWP)",
    };

    return types[type] || type || "-";
  };

  // ============================================================
  // FORMAT DATE
  // ============================================================

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

  // ============================================================
  // STATUS CLASS
  // ============================================================

  const getStatusClass = (status) => {
    switch (status) {
      case "approved":
        return "bg-emerald-100 text-emerald-700";

      case "rejected":
        return "bg-rose-100 text-rose-700";

      case "cancelled":
        return "bg-slate-100 text-slate-600";

      case "pending":
        return "bg-amber-100 text-amber-700";

      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  // ============================================================
  // LEAVE DAYS
  // ============================================================

  const requestedDays = calculateDays();

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-indigo-600" />

          <h2 className="text-lg font-semibold text-slate-800">
            Leave Management
          </h2>
        </div>

        {/* ====================================================
            LEAVE BALANCES
        ==================================================== */}

        <div className="flex flex-wrap gap-2 text-xs font-medium">
          {/* Paid Leave */}
          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
            Paid: {leaveBalance.paid ?? 0}
          </span>

          {/* Casual Leave */}
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
            Casual: {leaveBalance.casual ?? 0}
          </span>

          {/* Sick Leave */}
          <span className="bg-rose-50 text-rose-700 px-3 py-1 rounded-full border border-rose-200">
            Sick: {leaveBalance.sick ?? 0}
          </span>

          {/* Optional Holiday */}
          <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
            OH: {leaveBalance.oh ?? 0}
          </span>

          {/* Compensatory Off */}
          <span className="bg-cyan-50 text-cyan-700 px-3 py-1 rounded-full border border-cyan-200">
            COFF: {leaveBalance.coff ?? 0}
          </span>

          {/* Maternity Leave */}
          <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full border border-pink-200">
            Maternity: {leaveBalance.maternity ?? 0}
          </span>

          {/* Paternity Leave */}
          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
            Paternity: {leaveBalance.paternity ?? 0}
          </span>

          {/* Bereavement Leave */}
          <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-200">
            Bereavement: {leaveBalance.bereavement ?? 0}
          </span>

          {/* Leave Without Pay */}
          <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full border border-orange-200">
            LWP: {leaveBalance.lwp ?? 0}
          </span>
        </div>
      </div>

      {/* ======================================================
          APPLY LEAVE FORM
      ====================================================== */}

      <form
        onSubmit={handleApply}
        className="bg-slate-50 p-4 rounded-lg mb-6 text-sm border border-slate-200"
      >
        <h3 className="font-semibold text-xs text-slate-700 mb-3 uppercase tracking-wider">
          Apply for Leave
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          {/* Leave Type */}

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Leave Type
            </label>

            <select
              name="leaveType"
              value={formData.leaveType}
              onChange={handleChange}
              className="w-full border rounded p-2 bg-white text-slate-800"
            >
              <option value="paid">Paid Leave (PL)</option>

              <option value="casual">Casual Leave (CL)</option>

              <option value="sick">Sick Leave (SL)</option>

              <option value="oh">Optional Holiday (OH)</option>

              <option value="coff">Compensatory Off (COFF)</option>

              <option value="maternity">Maternity Leave</option>

              <option value="paternity">Paternity Leave</option>

              <option value="bereavement">Bereavement Leave</option>

              <option value="lwp">Leave Without Pay (LWP)</option>
            </select>
          </div>

          {/* Start Date */}

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Start Date
            </label>

            <input
              type="date"
              name="startDate"
              required
              value={formData.startDate}
              onChange={handleChange}
              className="w-full border rounded p-2 bg-white"
            />
          </div>

          {/* End Date */}

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              End Date
            </label>

            <input
              type="date"
              name="endDate"
              required
              min={formData.startDate || undefined}
              value={formData.endDate}
              onChange={handleChange}
              className="w-full border rounded p-2 bg-white"
            />
          </div>

          {/* Requested Days */}

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Requested Days
            </label>

            <div
              className={`w-full border rounded p-2 bg-white ${
                requestedDays > 0
                  ? "text-indigo-600 font-semibold"
                  : "text-slate-400"
              }`}
            >
              {requestedDays > 0
                ? requestedDays +
                  " day" +
                  (requestedDays !== 1 ? "s" : "") +
                  " requested"
                : "Select dates"}
            </div>
          </div>
        </div>

        {/* ====================================================
            REASON
        ==================================================== */}

        <div className="mb-3">
          <input
            type="text"
            name="reason"
            required
            maxLength={500}
            placeholder="Reason for leave"
            value={formData.reason}
            onChange={handleChange}
            className="w-full border rounded p-2 bg-white"
          />

          <div className="text-[10px] text-slate-400 mt-1">
            {formData.reason.length}
            /500 characters
          </div>
        </div>

        {formData.leaveType === "sick" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Medical Prescription <span className="text-red-500">*</span>
            </label>

            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setPrescriptionFile(e.target.files[0])}
              required
            />

            <p className="text-xs text-slate-500 mt-1">
              Required for sick leave. PDF, JPG, JPEG or PNG.
            </p>
          </div>
        )}

        {/* ====================================================
            LWP INFORMATION
        ==================================================== */}

        {formData.leaveType === "lwp" && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg p-3 mb-3 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />

            <div>
              <strong>Leave Without Pay:</strong> LWP does not require an
              available leave balance. The requested days will be added to your
              total LWP count.
            </div>
          </div>
        )}

        {/* ====================================================
            BALANCE INFORMATION
        ==================================================== */}

        {formData.leaveType !== "lwp" && requestedDays > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg p-3 mb-3 text-xs">
            <Calendar className="w-4 h-4 shrink-0" />

            <div>
              Available balance:{" "}
              <strong>{leaveBalance[formData.leaveType] ?? 0}</strong> day(s)
              {" | "}
              Requested: <strong>{requestedDays}</strong> day(s)
            </div>
          </div>
        )}

        {/* ====================================================
            SUBMIT
        ==================================================== */}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Submit Leave Request"}
        </button>
      </form>

      {/* ======================================================
          LEAVE REQUESTS TABLE
      ====================================================== */}

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
            {listLoading ? (
              <tr>
                <td
                  colSpan={isApprover ? 7 : 6}
                  className="py-8 text-center text-slate-400"
                >
                  Loading leave requests...
                </td>
              </tr>
            ) : leaves.length === 0 ? (
              <tr>
                <td
                  colSpan={isApprover ? 7 : 6}
                  className="py-8 text-center text-slate-400"
                >
                  No leave records to display
                </td>
              </tr>
            ) : (
              leaves.map((leave) => (
                <tr
                  key={leave._id}
                  className="text-slate-700 hover:bg-slate-50/50"
                >
                  {/* Applicant */}

                  {isApprover && (
                    <td className="py-2.5 font-medium">
                      {leave.userId?.name || "Unknown"}

                      <span className="block text-[10px] text-slate-400">
                        {leave.userId?.email || "-"}
                      </span>
                    </td>
                  )}

                  {/* Type */}

                  <td className="py-2.5 font-medium whitespace-nowrap">
                    {formatLeaveType(leave.leaveType)}
                  </td>

                  {/* Date Range */}

                  <td className="py-2.5 whitespace-nowrap">
                    {formatDate(leave.startDate)}

                    <span className="mx-1">→</span>

                    {formatDate(leave.endDate)}
                  </td>

                  {/* Days */}

                  <td className="py-2.5 font-semibold">
                    {leave.daysCount ?? "-"}
                  </td>

                  {/* Reason */}

                  <td className="py-2.5 max-w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-slate-600"
                        title={leave.reason}
                      >
                        {leave.reason || "-"}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveReason({
                            user: leave.userId?.name || "Self",

                            reason: leave.reason || "No reason provided",

                            type: leave.leaveType,

                            rejectionReason: leave.rejectionReason,
                          })
                        }
                        className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded shrink-0"
                        title="View Reason"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Status */}

                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${getStatusClass(
                        leave.status,
                      )}`}
                    >
                      {leave.status || "-"}
                    </span>
                  </td>

                  {/* Actions */}

                  <td className="py-2.5 text-right space-x-1 whitespace-nowrap">
                    {/* Manager/Admin */}

                    {isApprover && leave.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(leave._id)}
                          className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                          title="Approve"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openRejectModal(leave._id)}
                          className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                          title="Reject & Refund"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : !isApprover && leave.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => handleCancelLeave(leave._id)}
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ======================================================
          PAGINATION
      ====================================================== */}

      <Pagination
        pagination={pagination}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* ======================================================
          VIEW REASON MODAL
      ====================================================== */}

      {activeReason && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            {/* Header */}

            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">
                Leave Reason:{" "}
                <span className="text-indigo-600">{activeReason.user}</span>
              </h3>

              <button
                type="button"
                onClick={() => setActiveReason(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Leave Type */}

            <div className="mb-2">
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {formatLeaveType(activeReason.type)}
              </span>
            </div>

            {/* Reason */}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed max-h-40 overflow-y-auto break-words">
              {activeReason.reason}
            </div>

            {/* Rejection Reason */}

            {activeReason.rejectionReason && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                <span className="font-semibold block mb-1">
                  Rejection Remark:
                </span>

                {activeReason.rejectionReason}
              </div>
            )}

            {/* Close */}

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setActiveReason(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          REJECT MODAL
      ====================================================== */}

      {rejectModal.open && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            {/* Header */}

            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">
                Reject Leave Request
              </h3>

              <button
                type="button"
                onClick={closeRejectModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}

            <form onSubmit={handleConfirmReject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Rejection Reason / Remark
                </label>

                <textarea
                  rows={4}
                  required
                  maxLength={500}
                  placeholder="e.g. Critical project milestone in this duration"
                  className="w-full border rounded p-2 text-slate-800 resize-none"
                  value={rejectModal.reason}
                  onChange={(e) =>
                    setRejectModal((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                />

                <div className="text-[10px] text-slate-400 mt-1">
                  {rejectModal.reason.length}
                  /500 characters
                </div>
              </div>

              {/* Buttons */}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={closeRejectModal}
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
