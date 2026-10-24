import React, { useEffect, useState } from "react";

import {
  Calendar,
  Check,
  X,
  FileText,
  Ban,
  AlertCircle,
  Download,
  Eye,
} from "lucide-react";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Pagination from "./Pagination";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const SERVER_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

const getPrescriptionFileName = (prescription) => {
  if (!prescription) {
    return null;
  }

  let value = "";

  if (typeof prescription === "object") {
    value =
      prescription.fileName ||
      prescription.filename ||
      prescription.file_name ||
      prescription.path ||
      prescription.url ||
      prescription.fileUrl ||
      prescription.location ||
      "";
  }

  if (typeof prescription === "string") {
    value = prescription;
  }

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const normalized = value.replace(/\\/g, "/").replace(/^file:\/\//i, "");
  const fileName = normalized.split("/").pop();

  if (!fileName) {
    return null;
  }

  return decodeURIComponent(fileName);
};

const getPrescriptionUrl = (prescription) => {
  if (!prescription) {
    return null;
  }

  if (typeof prescription === "object") {
    const possibleUrl =
      prescription.url || prescription.fileUrl || prescription.fileURL;

    if (possibleUrl && /^https?:\/\//i.test(String(possibleUrl))) {
      return possibleUrl;
    }
  }

  if (typeof prescription === "string" && /^https?:\/\//i.test(prescription)) {
    return prescription;
  }

  const fileName = getPrescriptionFileName(prescription);

  if (!fileName) {
    return null;
  }

  return `${SERVER_BASE_URL}/uploads/prescriptions/${encodeURIComponent(
    fileName,
  )}`;
};

const getPrescriptionDownloadName = (prescription) => {
  if (!prescription) {
    return "prescription";
  }

  if (typeof prescription === "object" && prescription.originalName) {
    return prescription.originalName;
  }

  const fileName = getPrescriptionFileName(prescription);

  return fileName || "prescription";
};

export default function LeaveManager() {
  const { user, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const isApprover =
    user?.role === "manager" || user?.role === "admin" || user?.role === "hr";

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

  /*
  |--------------------------------------------------------------------------
  | Leave Form (Updated with Half-Day Support)
  |--------------------------------------------------------------------------
  */

  const [formData, setFormData] = useState({
    leaveType: "paid",
    startDate: "",
    endDate: "",
    reason: "",
    prescription: null,
    isHalfDay: false,
    halfDaySession: "first",
  });

  const leaveBalance = user?.leaveBalance || {};

  const fetchLeaves = async (page = 1) => {
    try {
      setListLoading(true);

      const endpoint = isApprover ? "/leaves/all" : "/leaves/my-leaves";
      const res = await api.get(`${endpoint}?page=${page}&limit=5`);

      const responseData = res?.data || {};
      const data = responseData?.data || responseData;

      setLeaves(data?.leaves || []);
      setPagination(data?.pagination || null);
      setCurrentPage(page);
    } catch (err) {
      console.error("Fetch leaves error:", err);
      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load leave requests",
      );
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLeaves(currentPage);
    }
  }, [user?.role, currentPage]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /*
  |--------------------------------------------------------------------------
  | Calculate Days (Handles Half-Day 0.5 Deduction)
  |--------------------------------------------------------------------------
  */

  const calculateDays = () => {
    if (formData.isHalfDay) {
      return 0.5;
    }

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

  const handlePrescriptionChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      setFormData((prev) => ({
        ...prev,
        prescription: null,
      }));
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      showError("Only PDF, JPG, JPEG and PNG files are allowed.");
      e.target.value = "";
      setFormData((prev) => ({
        ...prev,
        prescription: null,
      }));
      return;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      showError("Prescription file size must not exceed 5 MB.");
      e.target.value = "";
      setFormData((prev) => ({
        ...prev,
        prescription: null,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      prescription: file,
    }));
  };

  const removePrescription = () => {
    setFormData((prev) => ({
      ...prev,
      prescription: null,
    }));

    const input = document.getElementById("prescription");
    if (input) {
      input.value = "";
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();

    if (!formData.leaveType) {
      showError("Please select a leave type");
      return;
    }

    if (!formData.startDate) {
      showError("Please select start date");
      return;
    }

    if (!formData.isHalfDay && !formData.endDate) {
      showError("Please select end date");
      return;
    }

    if (!formData.reason.trim()) {
      showError("Please enter reason for leave");
      return;
    }

    if (formData.reason.trim().length > 500) {
      showError("Reason cannot exceed 500 characters.");
      return;
    }

    if (!formData.isHalfDay && formData.startDate > formData.endDate) {
      showError("Start date cannot be after end date");
      return;
    }

    if (formData.leaveType === "sick" && !formData.prescription) {
      showError("Medical prescription is mandatory for Sick Leave.");
      return;
    }

    const requestedDays = calculateDays();

    if (requestedDays <= 0) {
      showError("Invalid leave date range");
      return;
    }

    if (formData.leaveType !== "lwp") {
      const balance = Number(leaveBalance[formData.leaveType] ?? 0);

      if (balance < requestedDays) {
        showError(
          `Insufficient leave balance. You have ${balance} day(s) available but requested ${requestedDays} day(s).`,
        );
        return;
      }
    }

    const payload = new FormData();
    payload.append("leaveType", formData.leaveType);
    payload.append("startDate", formData.startDate);
    payload.append(
      "endDate",
      formData.isHalfDay ? formData.startDate : formData.endDate,
    );
    payload.append("reason", formData.reason.trim());
    payload.append("isHalfDay", formData.isHalfDay);

    if (formData.isHalfDay) {
      payload.append("halfDaySession", formData.halfDaySession);
    }

    if (formData.prescription instanceof File) {
      payload.append("prescription", formData.prescription);
    }

    try {
      setLoading(true);

      const res = await api.post("/leaves/apply", payload);

      showSuccess(
        res?.message ||
          res?.data?.message ||
          "Leave application submitted successfully!",
      );

      setFormData({
        leaveType: "paid",
        startDate: "",
        endDate: "",
        reason: "",
        prescription: null,
        isHalfDay: false,
        halfDaySession: "first",
      });

      const fileInput = document.getElementById("prescription");
      if (fileInput) {
        fileInput.value = "";
      }

      await fetchLeaves(1);

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Apply leave error:", err);
      showError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Unable to submit leave application",
      );
    } finally {
      setLoading(false);
    }
  };

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
      const res = await api.patch(`/leaves/${id}/review`, {
        status: "approved",
      });

      showSuccess(res?.message || "Leave request approved successfully");
      await fetchLeaves(currentPage);

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Approve leave error:", err);
      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to approve leave request",
      );
    }
  };

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

  const closeRejectModal = () => {
    setRejectModal({
      open: false,
      leaveId: null,
      reason: "",
    });
  };

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
      const res = await api.patch(`/leaves/${rejectModal.leaveId}/review`, {
        status: "rejected",
        rejectionReason,
      });

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
      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to reject leave request",
      );
    }
  };

  const handleCancelLeave = async (id) => {
    if (!id) {
      showError("Invalid leave request");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this leave request?",
    );

    if (!confirmed) {
      return;
    }

    try {
      const res = await api.patch(`/leaves/${id}/cancel`);
      showSuccess(res?.message || "Leave request cancelled successfully");
      await fetchLeaves(currentPage);

      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error("Cancel leave error:", err);
      showError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to cancel leave request",
      );
    }
  };

  const handlePreviewPrescription = (prescription) => {
    const url = getPrescriptionUrl(prescription);

    if (!url) {
      showError("Prescription file is not available.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadPrescription = async (prescription) => {
    const url = getPrescriptionUrl(prescription);

    if (!url) {
      showError("Prescription file is not available.");
      return;
    }

    try {
      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Unable to download prescription. Server returned ${response.status}.`,
        );
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = blobUrl;
      link.download = getPrescriptionDownloadName(prescription);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Prescription download error:", err);
      showError(err?.message || "Unable to download prescription");
    }
  };

  const formatLeaveType = (type) => {
    const types = {
      paid: "Paid Leave (PL)",
      casual: "Casual Leave (CL)",
      sick: "Sick Leave (SL)",
      oh: "OH",
      coff: "Compensatory Off (COFF)",
      maternity: "Maternity Leave",
      paternity: "Paternity Leave",
      bereavement: "Bereavement Leave",
      lwp: "Leave Without Pay (LWP)",
    };

    return types[type] || type || "-";
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

  const requestedDays = calculateDays();

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      {/* HEADER */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            Leave Management
          </h2>
        </div>

        {/* Leave Balances */}
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
            Paid: {leaveBalance.paid ?? 0}
          </span>
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
            Casual: {leaveBalance.casual ?? 0}
          </span>
          <span className="bg-rose-50 text-rose-700 px-3 py-1 rounded-full border border-rose-200">
            Sick: {leaveBalance.sick ?? 0}
          </span>
          <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
            OH: {leaveBalance.oh ?? 0}
          </span>
          <span className="bg-cyan-50 text-cyan-700 px-3 py-1 rounded-full border border-cyan-200">
            COFF: {leaveBalance.coff ?? 0}
          </span>
          <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full border border-pink-200">
            Maternity: {leaveBalance.maternity ?? 0}
          </span>
          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
            Paternity: {leaveBalance.paternity ?? 0}
          </span>
          <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full border border-orange-200">
            Bereavement: {leaveBalance.bereavement ?? 0}
          </span>
          <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full border border-orange-200">
            LWP: {leaveBalance.lwp ?? 0}
          </span>
        </div>
      </div>

      {/* APPLY LEAVE FORM */}
      <form
        onSubmit={handleApply}
        className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6"
      >
        <div className="flex flex-wrap justify-between items-center mb-3">
          <div className="text-xs font-semibold text-indigo-700 uppercase">
            Apply for Leave
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-indigo-600 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isHalfDay}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  isHalfDay: e.target.checked,
                  endDate: e.target.checked ? prev.startDate : prev.endDate,
                }))
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Apply as Half-Day (0.5 Day)</span>
          </label>
        </div>

        {/* First Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Leave Type
            </label>
            <select
              name="leaveType"
              value={formData.leaveType}
              onChange={handleChange}
              className="w-full border rounded p-2 bg-white text-xs"
            >
              <option value="paid">Paid Leave (PL)</option>
              <option value="casual">Casual Leave (CL)</option>
              <option value="sick">Sick Leave (SL)</option>
              <option value="oh">OH</option>
              <option value="coff">Compensatory Off (COFF)</option>
              <option value="maternity">Maternity Leave</option>
              <option value="paternity">Paternity Leave</option>
              <option value="bereavement">Bereavement Leave</option>
              <option value="lwp">Leave Without Pay (LWP)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              {formData.isHalfDay ? "Leave Date" : "Start Date"}
            </label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={(e) => {
                const val = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  startDate: val,
                  endDate: prev.isHalfDay ? val : prev.endDate,
                }));
              }}
              className="w-full border rounded p-2 bg-white text-xs"
            />
          </div>

          {!formData.isHalfDay ? (
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                End Date
              </label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="w-full border rounded p-2 bg-white text-xs"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Half-Day Session
              </label>
              <select
                name="halfDaySession"
                value={formData.halfDaySession}
                onChange={handleChange}
                className="w-full border rounded p-2 bg-white text-xs font-medium"
              >
                <option value="first">First Half (Morning)</option>
                <option value="second">Second Half (Afternoon)</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Requested Days
            </label>
            <div
              className={`w-full border rounded p-2 bg-white text-xs ${
                requestedDays > 0
                  ? "text-indigo-600 font-semibold"
                  : "text-slate-400"
              }`}
            >
              {requestedDays > 0
                ? `${requestedDays} day${
                    requestedDays !== 1 ? "s" : ""
                  } requested`
                : "Select dates"}
            </div>
          </div>
        </div>

        {/* SICK PRESCRIPTION */}
        {formData.leaveType === "sick" && (
          <div className="mb-3">
            <label
              htmlFor="prescription"
              className="text-xs text-slate-600 block mb-1 font-medium"
            >
              Medical Prescription
              <span className="text-rose-600 ml-1">*</span>
            </label>

            <input
              id="prescription"
              name="prescription"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={handlePrescriptionChange}
              required={formData.leaveType === "sick"}
              className="w-full border rounded p-2 bg-white text-xs"
            />

            <p className="text-[11px] text-slate-500 mt-1">
              Required for Sick Leave. PDF, JPG, JPEG or PNG only. Maximum size:
              5 MB.
            </p>

            {formData.prescription && (
              <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-700 truncate">
                    {formData.prescription.name}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={removePrescription}
                  className="text-rose-500 hover:text-rose-700 ml-2"
                  title="Remove prescription"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="mb-3">
          <input
            type="text"
            name="reason"
            required
            maxLength={500}
            placeholder="Reason for leave"
            value={formData.reason}
            onChange={handleChange}
            className="w-full border rounded p-2 bg-white text-xs"
          />
          <div className="text-[10px] text-slate-400 mt-1">
            {formData.reason.length}/500 characters
          </div>
        </div>

        {/* LWP Information */}
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

        {/* Balance Information */}
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

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded transition text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Submit Leave Request"}
        </button>
      </form>

      {/* LEAVE REQUEST TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              {isApprover && <th className="pb-2">Applicant</th>}
              <th className="pb-2">Type</th>
              <th className="pb-2">Date Range</th>
              <th className="pb-2">Days</th>
              <th className="pb-2">Reason</th>
              {isApprover && <th className="pb-2">Prescription</th>}
              <th className="pb-2">Status</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {listLoading ? (
              <tr>
                <td
                  colSpan={isApprover ? 8 : 7}
                  className="py-8 text-center text-slate-400"
                >
                  Loading leave requests...
                </td>
              </tr>
            ) : leaves.length === 0 ? (
              <tr>
                <td
                  colSpan={isApprover ? 8 : 7}
                  className="py-8 text-center text-slate-400"
                >
                  No leave records to display
                </td>
              </tr>
            ) : (
              leaves.map((leave) => {
                const prescriptionUrl = getPrescriptionUrl(leave.prescription);

                return (
                  <tr
                    key={leave._id}
                    className="text-slate-700 hover:bg-slate-50/50"
                  >
                    {isApprover && (
                      <td className="py-2.5 font-medium">
                        {leave.userId?.name || "Unknown"}
                        <span className="block text-[10px] text-slate-400">
                          {leave.userId?.email}
                        </span>
                      </td>
                    )}

                    <td className="py-2.5 font-medium whitespace-nowrap">
                      {formatLeaveType(leave.leaveType)}
                    </td>

                    <td className="py-2.5 whitespace-nowrap">
                      {leave.isHalfDay ? (
                        <span>
                          {formatDate(leave.startDate)}{" "}
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded ml-1 border border-indigo-200 uppercase font-semibold">
                            {leave.halfDaySession} Half
                          </span>
                        </span>
                      ) : (
                        <span>
                          {formatDate(leave.startDate)}
                          <span className="mx-1">→</span>
                          {formatDate(leave.endDate)}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 font-semibold">
                      {leave.daysCount ?? "-"}
                    </td>

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

                    {isApprover && (
                      <td className="py-2.5">
                        {leave.leaveType === "sick" && prescriptionUrl ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-[10px] font-medium"
                              onClick={() =>
                                handlePreviewPrescription(leave.prescription)
                              }
                              title="Preview prescription"
                            >
                              <Eye className="w-3 h-3" />
                              Preview
                            </button>

                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded text-[10px] font-medium"
                              onClick={() =>
                                handleDownloadPrescription(leave.prescription)
                              }
                              title="Download prescription"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          </div>
                        ) : leave.leaveType === "sick" ? (
                          <span className="text-[10px] text-slate-400">
                            Not available
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">-</span>
                        )}
                      </td>
                    )}

                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${getStatusClass(
                          leave.status,
                        )}`}
                      >
                        {leave.status || "-"}
                      </span>
                    </td>

                    <td className="py-2.5 text-right space-x-1 whitespace-nowrap">
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination
        pagination={pagination}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* VIEW REASON MODAL */}
      {activeReason && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
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

            <div className="mb-2">
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {formatLeaveType(activeReason.type)}
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

      {/* REJECT MODAL */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
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

            <form onSubmit={handleConfirmReject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Rejection Reason / Remark
                </label>
                <textarea
                  rows={4}
                  required
                  maxLength={500}
                  placeholder="Enter rejection reason"
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
                  {rejectModal.reason.length}/500 characters
                </div>
              </div>

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
                  Confirm Rejection & Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
