import React, { useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  Settings,
  UserPlus,
  X,
  Mail,
  Download,
  FileSpreadsheet,
  UserPen,
  Upload,
  FileText,
  Calendar,
  Clock,
  Plus,
} from "lucide-react";
import api from "../api/client";
import Pagination from "./Pagination";
import { useToast } from "../context/ToastContext";
import EmployeeProfileModal from "./EmployeeProfileModal";

export default function AdminPanel() {
  const [staff, setStaff] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [managers, setManagers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [balanceForm, setBalanceForm] = useState({
    leaveType: "paid",
    amount: 15,
  });

  // Edit Staff State
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "employee",
  });
  const [editLoading, setEditLoading] = useState(false);

  // Single Staff Creation State with All Leave Quotas
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    employeeId: "",
    name: "",
    email: "",
    role: "employee",
    reportingManager: "",
    casualLeave: 12,
    sickLeave: 8,
    paidLeave: 15,
    optionalHoliday: 2,
    coffBalance: 0,
    paternityLeave: 3,
    maternityLeave: 182,
    bereavementLeave: 3,
    lwpBalance: 0,
  });

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedCsv, setSelectedCsv] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Admin Apply Leave for Employee State
  const [showAdminLeaveModal, setShowAdminLeaveModal] = useState(false);
  const [adminLeaveLoading, setAdminLeaveLoading] = useState(false);
  const [adminLeaveForm, setAdminLeaveForm] = useState({
    employeeId: "",
    leaveType: "casual",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reason: "",
  });

  // Bulk / Individual Add Leave State
  const [showGrantAllModal, setShowGrantAllModal] = useState(false);
  const [grantAllLoading, setGrantAllLoading] = useState(false);
  const [grantAllForm, setGrantAllForm] = useState({
    targetType: "all",
    userId: "",
    leaveType: "paid",
    amount: 1,
    reason: "Monthly leave credit",
  });

  // Report Filter State
  const currentDate = new Date();
  const [reportEmployeeId, setReportEmployeeId] = useState("all");
  const [reportLeaveType, setReportLeaveType] = useState("all");
  const [reportMonth, setReportMonth] = useState(currentDate.getMonth() + 1);
  const [reportYear, setReportYear] = useState(currentDate.getFullYear());
  const [downloading, setDownloading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [resetLoadingId, setResetLoadingId] = useState(null);

  // Direct Mark Attendance Modal State
  const [showDirectAttendanceModal, setShowDirectAttendanceModal] =
    useState(false);
  const [directAttLoading, setDirectAttLoading] = useState(false);
  const [directAttForm, setDirectAttForm] = useState({
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:30",
    endTime: "18:30",
    remarks: "Duty marked manually by HR",
  });

  const { showSuccess, showError } = useToast();

  const fetchAllStaff = async () => {
    try {
      const res = await api.get("/admin/staff?page=1&limit=1000");
      setAllStaff(res.data?.staff || res.data?.data?.staff || []);
    } catch (err) {
      console.error("Failed to load full staff list", err);
    }
  };

  const fetchStaff = async (page = 1) => {
    try {
      const res = await api.get("/admin/staff?page=" + page + "&limit=5");
      setStaff(res.data.staff || []);
      setManagers(res.data.managers || []);
      setPagination(res.data.pagination);
      setCurrentPage(page);
    } catch (err) {
      showError(err.message);
    }
  };

  useEffect(() => {
    fetchStaff(currentPage);
    fetchAllStaff();
  }, [currentPage]);

  const handleToggleStatus = async (employeeId) => {
    try {
      const res = await api.patch("/admin/toggle-status", { employeeId });
      showSuccess(res.message || "Staff status updated");
      fetchStaff(currentPage);
      fetchAllStaff();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleManagerChange = async (employeeId, managerId) => {
    try {
      const res = await api.patch("/admin/assign-manager", {
        employeeId,
        managerId: managerId || null,
      });
      showSuccess(res.message || "Manager assigned successfully");
      fetchStaff(currentPage);
      fetchAllStaff();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleBalanceSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.patch("/admin/adjust-balance", {
        employeeId: selectedUser._id,
        leaveType: balanceForm.leaveType,
        amount: Number(balanceForm.amount),
      });
      showSuccess(res.message || "Leave balance adjusted");
      setSelectedUser(null);
      fetchStaff(currentPage);
    } catch (err) {
      showError(err.message);
    }
  };

  const openEditModal = (member) => {
    setEditUser(member);
    setEditForm({ name: member.name, email: member.email, role: member.role });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const res = await api.patch("/admin/update-staff", {
        employeeId: editUser._id,
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
      });
      showSuccess(res.message || "Staff profile updated successfully");
      setEditUser(null);
      fetchStaff(currentPage);
      fetchAllStaff();
    } catch (err) {
      showError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await api.post("/admin/create-staff", createForm);
      showSuccess(res.message || "Staff user created successfully!");
      setShowCreateModal(false);
      setCreateForm({
        employeeId: "",
        name: "",
        email: "",
        role: "employee",
        reportingManager: "",
        casualLeave: 12,
        sickLeave: 8,
        paidLeave: 15,
        optionalHoliday: 2,
        coffBalance: 0,
        paternityLeave: 3,
        maternityLeave: 182,
        bereavementLeave: 3,
        lwpBalance: 0,
      });
      fetchStaff(1);
      fetchAllStaff();
    } catch (err) {
      showError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!selectedCsv) {
      return showError("Please select a CSV file to upload");
    }

    const formData = new FormData();
    formData.append("file", selectedCsv);

    setImporting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        (import.meta.env.VITE_API_URL || "http://localhost:5000/api") +
          "/admin/bulk-import",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: formData,
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Bulk import failed");
      }

      showSuccess(data.message);
      setShowImportModal(false);
      setSelectedCsv(null);
      fetchStaff(1);
      fetchAllStaff();
    } catch (err) {
      showError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleAdminLeaveSubmit = async (e) => {
    e.preventDefault();
    setAdminLeaveLoading(true);
    try {
      const res = await api.post("/admin/apply-employee-leave", adminLeaveForm);
      showSuccess(res.message || "Leave assigned and deducted successfully!");
      setShowAdminLeaveModal(false);
      setAdminLeaveForm({
        employeeId: "",
        leaveType: "casual",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        reason: "",
      });
      fetchStaff(currentPage);
    } catch (err) {
      showError(err.message);
    } finally {
      setAdminLeaveLoading(false);
    }
  };

  const handleDirectAttendanceSubmit = async (e) => {
    e.preventDefault();
    setDirectAttLoading(true);
    try {
      const res = await api.post("/admin/direct-attendance", directAttForm);
      showSuccess(res.message || "Attendance recorded successfully!");
      setShowDirectAttendanceModal(false);
      setDirectAttForm({
        employeeId: "",
        date: new Date().toISOString().split("T")[0],
        startTime: "09:30",
        endTime: "18:30",
        remarks: "Duty marked manually by HR",
      });
      fetchStaff(currentPage);
    } catch (err) {
      showError(err.message);
    } finally {
      setDirectAttLoading(false);
    }
  };

  const downloadSampleCsv = () => {
    const headers = [
      "employeeId",
      "name",
      "email",
      "role",
      "reportingManagerEmployeeId",
      "lwp",
      "casualLeave",
      "paidLeave",
      "sickLeave",
      "coffBalance",
      "optionalHoliday",
      "paternityLeave",
      "maternityLeave",
      "bereavementLeave",
    ];

    const rows = [
      [
        "MGR001",
        "Amit Kumar",
        "amit@company.com",
        "employee",
        "",
        12,
        8,
        12,
        8,
        0,
        2,
        3,
        182,
        3,
      ],
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((value) => {
            if (value === null || value === undefined) return "";
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "staff_import_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const queryParams = new URLSearchParams({
        employeeId: reportEmployeeId,
        leaveType: reportLeaveType,
        month: reportMonth,
        year: reportYear,
      }).toString();

      const response = await fetch(
        (import.meta.env.VITE_API_URL || "http://localhost:5000/api") +
          "/admin/export-attendance?" +
          queryParams,
        { headers: { Authorization: "Bearer " + token } },
      );

      if (!response.ok) throw new Error("Failed to download attendance file");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "Attendance_Report_" +
        reportEmployeeId +
        "_" +
        reportYear +
        "_" +
        reportMonth +
        ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showSuccess("Attendance report downloaded successfully!");
    } catch (err) {
      showError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleGrantLeaveToAll = async (e) => {
    e.preventDefault();

    if (!grantAllForm.leaveType) {
      showError("Please select a leave type");
      return;
    }

    const amount = parseFloat(grantAllForm.amount);
    if (isNaN(amount) || amount <= 0) {
      showError("Please enter a valid positive number of days (e.g. 0.5, 1)");
      return;
    }

    if (grantAllForm.targetType === "individual" && !grantAllForm.userId) {
      showError("Please select an individual employee");
      return;
    }

    const leaveTypeLabels = {
      paid: "PL - Paid Leave",
      casual: "CL - Casual Leave",
      sick: "SL - Sick Leave",
      oh: "OH - Optional Holiday",
      coff: "COFF - Compensatory Off",
      paternity: "PAT - Paternity Leave",
      maternity: "MAT - Maternity Leave",
      bereavement: "BRV - Bereavement Leave",
      lwp: "LWP - Leave Without Pay",
    };

    const leaveLabel =
      leaveTypeLabels[grantAllForm.leaveType] ||
      grantAllForm.leaveType.toUpperCase();

    const targetDesc =
      grantAllForm.targetType === "individual"
        ? "the selected employee"
        : "ALL active employees";

    const confirmed = window.confirm(
      `Are you sure you want to credit ${amount} day(s) of ${leaveLabel} to ${targetDesc}?`,
    );

    if (!confirmed) return;

    setGrantAllLoading(true);

    try {
      const res = await api.post("/admin/grant-leave-all", {
        targetType: grantAllForm.targetType,
        userId: grantAllForm.userId || null,
        leaveType: grantAllForm.leaveType,
        amount,
        reason: grantAllForm.reason?.trim() || "Leave credit",
      });

      showSuccess(res.message || "Leave credited successfully!");
      setShowGrantAllModal(false);
      setGrantAllForm({
        targetType: "all",
        userId: "",
        leaveType: "paid",
        amount: 1,
        reason: "Monthly leave credit",
      });

      await fetchStaff(currentPage);
      await fetchAllStaff();
    } catch (err) {
      console.error("Grant leave error:", err);
      showError(err.message || "Failed to grant leave");
    } finally {
      setGrantAllLoading(false);
    }
  };

  const handleResetPassword = async (member) => {
    const confirmed = window.confirm(
      `Are you sure you want to reset the password for ${member.name}? A new random password will be emailed to them.`,
    );
    if (!confirmed) return;

    setResetLoadingId(member._id);
    try {
      const res = await api.post("/admin/employee-reset-password", {
        employeeId: member._id,
      });
      showSuccess(res.message || "Password reset email sent successfully!");
    } catch (err) {
      showError(err.message || "Failed to reset password");
    } finally {
      setResetLoadingId(null);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            HR Admin Control Panel
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowGrantAllModal(true)}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Grant Leave to Staff</span>
          </button>

          <button
            onClick={() => setShowAdminLeaveModal(true)}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Calendar className="w-4 h-4" />
            <span>Apply Leave for Staff</span>
          </button>

          <button
            onClick={() => setShowDirectAttendanceModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Clock className="w-4 h-4" />
            <span>Direct Mark Attendance</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Bulk Import (.CSV)</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Single Staff</span>
          </button>
        </div>
      </div>

      {/* EXPORT REPORT SECTION */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-xs text-slate-800 uppercase tracking-wider">
            Export Attendance / Leave Report
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-slate-500 mb-1">Target Employee</label>
            <select
              value={reportEmployeeId}
              onChange={(e) => setReportEmployeeId(e.target.value)}
              className="w-full border rounded p-2 bg-white text-slate-800"
            >
              <option value="all">All Employees & Managers</option>
              {allStaff.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name} ({member.employeeId || member.email}) -{" "}
                  {member.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Leave Type</label>
            <select
              value={reportLeaveType}
              onChange={(e) => setReportLeaveType(e.target.value)}
              className="w-full border rounded p-2 bg-white text-slate-800"
            >
              <option value="all">All Leave Types</option>
              <option value="paid">Paid Leave (PL)</option>
              <option value="casual">Casual Leave (CL)</option>
              <option value="sick">Sick Leave (SL)</option>
              <option value="oh">Optional Holiday (OH)</option>
              <option value="coff">Compensatory Off (COFF)</option>
              <option value="paternity">Paternity Leave</option>
              <option value="maternity">Maternity Leave</option>
              <option value="bereavement">Bereavement Leave</option>
              <option value="lwp">Leave Without Pay (LWP)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Month</label>
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="w-full border rounded p-2 bg-white text-slate-800"
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
            <label className="block text-slate-500 mb-1">Year</label>
            <input
              type="number"
              min="2020"
              max="2050"
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
              className="w-full border rounded p-2 bg-white text-slate-800"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2 rounded transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? "Exporting..." : "Download CSV"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* STAFF TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
              <th className="p-3">Emp ID</th>
              <th className="p-3">Employee</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Assigned Approver</th>
              <th className="p-3">Leave Balances</th>
              <th className="p-3 text-right whitespace-nowrap min-w-[250px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((member) => (
              <tr
                key={member._id}
                className={`text-slate-700 ${
                  member.isActive === false ? "bg-rose-50/30" : ""
                }`}
              >
                <td className="p-3 font-mono font-bold text-slate-800">
                  {member.employeeId || "N/A"}
                </td>
                <td className="p-3 font-medium">
                  {member.name}
                  <span className="block text-[10px] text-slate-400">
                    {member.email}
                  </span>
                </td>
                <td className="p-3 capitalize">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      member.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : member.role === "manager"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {member.role}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      member.isActive !== false
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {member.isActive !== false ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="p-3">
                  <select
                    disabled={member.isActive === false}
                    className="border rounded p-1.5 text-xs bg-white text-slate-700 focus:outline-indigo-500 disabled:opacity-50"
                    value={member.reportingManager?._id || ""}
                    onChange={(e) =>
                      handleManagerChange(member._id, e.target.value)
                    }
                  >
                    <option value="">No Manager Assigned</option>
                    {managers
                      .filter((m) => m._id !== member._id)
                      .map((mgr) => (
                        <option key={mgr._id} value={mgr._id}>
                          {mgr.name} ({mgr.role})
                        </option>
                      ))}
                  </select>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5 max-w-[700px]">
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-medium whitespace-nowrap">
                      PL: {member.leaveBalance?.paid ?? 0}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200 font-medium whitespace-nowrap">
                      CL: {member.leaveBalance?.casual ?? 0}
                    </span>
                    <span className="bg-rose-50 text-rose-700 px-2 py-1 rounded border border-rose-200 font-medium whitespace-nowrap">
                      SL: {member.leaveBalance?.sick ?? 0}
                    </span>
                    <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-200 font-medium whitespace-nowrap">
                      OH: {member.leaveBalance?.oh ?? 0}
                    </span>
                    <span className="bg-cyan-50 text-cyan-700 px-2 py-1 rounded border border-cyan-200 font-medium whitespace-nowrap">
                      COFF: {member.leaveBalance?.coff ?? 0}
                    </span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-200 font-medium whitespace-nowrap">
                      PAT: {member.leaveBalance?.paternity ?? 0}
                    </span>
                    <span className="bg-pink-50 text-pink-700 px-2 py-1 rounded border border-pink-200 font-medium whitespace-nowrap">
                      MAT: {member.leaveBalance?.maternity ?? 0}
                    </span>
                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-300 font-medium whitespace-nowrap">
                      BRV: {member.leaveBalance?.bereavement ?? 0}
                    </span>
                    <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-200 font-medium whitespace-nowrap">
                      LWP: {member.leaveBalance?.lwp ?? 0}
                    </span>
                  </div>
                </td>
                <td className="p-3 text-right whitespace-nowrap min-w-[250px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handleToggleStatus(member._id)}
                      className={`h-7 px-2.5 rounded text-[11px] font-semibold border transition ${
                        member.isActive !== false
                          ? "text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100"
                          : "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                      }`}
                    >
                      {member.isActive !== false ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => openEditModal(member)}
                      className="h-7 px-2.5 rounded text-[11px] font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-indigo-600 transition inline-flex items-center gap-1"
                    >
                      <UserPen className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(member);
                        setBalanceForm({
                          leaveType: "paid",
                          amount: member.leaveBalance?.paid ?? 0,
                        });
                      }}
                      className="h-7 px-2.5 rounded text-[11px] font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition inline-flex items-center gap-1"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Quota</span>
                    </button>
                    <button
                      onClick={() => setSelectedEmployeeId(member._id)}
                      className="px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md border border-indigo-200 transition"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={() => handleResetPassword(member)}
                      disabled={resetLoadingId === member._id}
                      className="px-2.5 py-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 transition"
                    >
                      Reset Password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No staff members found.
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

      {/* GRANT LEAVE TO ALL OR INDIVIDUAL MODAL */}
      {showGrantAllModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Grant Leave to Staff
                </h3>
              </div>
              <button
                onClick={() => setShowGrantAllModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleGrantLeaveToAll}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Target Recipient *
                </label>
                <select
                  value={grantAllForm.targetType || "all"}
                  onChange={(e) =>
                    setGrantAllForm({
                      ...grantAllForm,
                      targetType: e.target.value,
                      userId: "",
                    })
                  }
                  className="w-full border rounded p-2 text-slate-700 bg-slate-50 mb-2"
                >
                  <option value="all">All Active Staff</option>
                  <option value="individual">Individual Employee</option>
                </select>

                {grantAllForm.targetType === "individual" && (
                  <select
                    required
                    value={grantAllForm.userId || ""}
                    onChange={(e) =>
                      setGrantAllForm({
                        ...grantAllForm,
                        userId: e.target.value,
                      })
                    }
                    className="w-full border rounded p-2 text-slate-700 bg-slate-50"
                  >
                    <option value="">Select Employee</option>
                    {allStaff.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.name} ({emp.employeeId || emp.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Leave Type *
                </label>
                <select
                  required
                  value={grantAllForm.leaveType}
                  onChange={(e) =>
                    setGrantAllForm({
                      ...grantAllForm,
                      leaveType: e.target.value,
                    })
                  }
                  className="w-full border rounded p-2 text-slate-700 bg-slate-50"
                >
                  <option value="">Select Leave Type</option>
                  <option value="paid">PL - Paid Leave</option>
                  <option value="casual">CL - Casual Leave</option>
                  <option value="sick">SL - Sick Leave</option>
                  <option value="oh">OH - Optional Holiday</option>
                  <option value="coff">COFF - Compensatory Off</option>
                  <option value="paternity">PAT - Paternity Leave</option>
                  <option value="maternity">MAT - Maternity Leave</option>
                  <option value="bereavement">BRV - Bereavement Leave</option>
                  <option value="lwp">LWP - Leave Without Pay</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Number of Days (e.g. 0.5, 1, 2) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={grantAllForm.amount}
                  onChange={(e) =>
                    setGrantAllForm({
                      ...grantAllForm,
                      amount: Number(e.target.value),
                    })
                  }
                  className="w-full border rounded p-2 text-slate-700 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Reason / Note
                </label>
                <input
                  type="text"
                  value={grantAllForm.reason}
                  onChange={(e) =>
                    setGrantAllForm({ ...grantAllForm, reason: e.target.value })
                  }
                  className="w-full border rounded p-2 text-slate-700 bg-slate-50"
                />
              </div>

              <button
                type="submit"
                disabled={grantAllLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm disabled:opacity-50"
              >
                {grantAllLoading ? "Granting..." : "Grant Leave"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Bulk Import Staff (.CSV)
                </h3>
                <p className="text-xs text-slate-500">
                  Atomic upload: updates existing, inserts new.
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-indigo-900">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Need the CSV format?</span>
              </div>
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Download Sample Template
              </button>
            </div>

            <form onSubmit={handleBulkUpload} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Select .CSV File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e) => setSelectedCsv(e.target.files[0])}
                  className="w-full border rounded p-2 text-slate-700 bg-slate-50"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-3.5 py-2 border rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || !selectedCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {importing
                      ? "Processing All Rows..."
                      : "Start Atomic Import"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE STAFF MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Add New Staff Member
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="EMP001"
                    className="w-full border rounded p-2 text-slate-800 uppercase"
                    value={createForm.employeeId}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        employeeId: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    className="w-full border rounded p-2 text-slate-800"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="john@company.com"
                    className="w-full border rounded p-2 text-slate-800"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Role
                  </label>
                  <select
                    className="w-full border rounded p-2 bg-white text-slate-800"
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, role: e.target.value })
                    }
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 border rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>
                    {createLoading
                      ? "Provisioning..."
                      : "Create & Send Credentials"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORCE APPLY LEAVE MODAL */}
      {showAdminLeaveModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Apply Leave for Employee
                </h3>
              </div>
              <button
                onClick={() => setShowAdminLeaveModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleAdminLeaveSubmit}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Select Employee
                </label>
                <select
                  required
                  className="w-full border rounded p-2 bg-white text-slate-800 font-medium"
                  value={adminLeaveForm.employeeId}
                  onChange={(e) =>
                    setAdminLeaveForm({
                      ...adminLeaveForm,
                      employeeId: e.target.value,
                    })
                  }
                >
                  <option value="">-- Choose Employee --</option>
                  {allStaff.map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.name} ({member.employeeId || member.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Leave Type
                </label>
                <select
                  required
                  className="w-full border rounded p-2 bg-white text-slate-800 font-medium"
                  value={adminLeaveForm.leaveType}
                  onChange={(e) =>
                    setAdminLeaveForm({
                      ...adminLeaveForm,
                      leaveType: e.target.value,
                    })
                  }
                >
                  <option value="paid">Paid Leave (PL)</option>
                  <option value="casual">Casual Leave (CL)</option>
                  <option value="sick">Sick Leave (SL)</option>
                  <option value="oh">Optional Holiday (OH)</option>
                  <option value="coff">Compensatory Off (COFF)</option>
                  <option value="paternity">Paternity Leave</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="bereavement">Bereavement Leave</option>
                  <option value="lwp">Leave Without Pay (LWP)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full border rounded p-2 bg-white text-slate-800"
                    value={adminLeaveForm.startDate}
                    onChange={(e) =>
                      setAdminLeaveForm({
                        ...adminLeaveForm,
                        startDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full border rounded p-2 bg-white text-slate-800"
                    value={adminLeaveForm.endDate}
                    onChange={(e) =>
                      setAdminLeaveForm({
                        ...adminLeaveForm,
                        endDate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Reason / Remarks
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter reason..."
                  className="w-full border rounded p-2 bg-white resize-none text-slate-800"
                  value={adminLeaveForm.reason}
                  onChange={(e) =>
                    setAdminLeaveForm({
                      ...adminLeaveForm,
                      reason: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAdminLeaveModal(false)}
                  className="px-3.5 py-2 border rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminLeaveLoading || !adminLeaveForm.employeeId}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-50 transition"
                >
                  {adminLeaveLoading
                    ? "Assigning Leave..."
                    : "Assign & Deduct Leave"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STAFF MODAL */}
      {editUser && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-lg border border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">
                Edit Staff:{" "}
                <span className="font-mono text-indigo-600">
                  {editUser.employeeId}
                </span>
              </h3>
              <button
                onClick={() => setEditUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  className="w-full border rounded p-2 text-slate-800"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  className="w-full border rounded p-2 text-slate-800"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  System Role
                </label>
                <select
                  className="w-full border rounded p-2 bg-white text-slate-800 font-medium"
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value })
                  }
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">HR Admin</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-3 py-1.5 border rounded text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {editLoading ? "Saving..." : "Update Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST QUOTA MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-lg border border-slate-200">
            <h3 className="font-semibold text-slate-800 text-sm mb-1">
              Adjust Quota: {selectedUser.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Directly override leave balance.
            </p>

            <form onSubmit={handleBalanceSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">
                  Select Leave Type
                </label>
                <select
                  required
                  className="w-full border rounded p-2 bg-white"
                  value={balanceForm.leaveType}
                  onChange={(e) => {
                    const type = e.target.value;
                    setBalanceForm({
                      leaveType: type,
                      amount: selectedUser.leaveBalance?.[type] ?? 0,
                    });
                  }}
                >
                  <option value="paid">Paid Leave (PL)</option>
                  <option value="casual">Casual Leave (CL)</option>
                  <option value="sick">Sick Leave (SL)</option>
                  <option value="oh">Optional Holiday (OH)</option>
                  <option value="coff">Compensatory Off (COFF)</option>
                  <option value="paternity">Paternity Leave</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="bereavement">Bereavement Leave</option>
                  <option value="lwp">Leave Without Pay (LWP)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">
                  New Balance Days
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  className="w-full border rounded p-2 text-slate-800"
                  value={balanceForm.amount}
                  onChange={(e) =>
                    setBalanceForm({
                      ...balanceForm,
                      amount: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-3 py-1.5 border rounded text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMPLOYEE PROFILE MODAL */}
      {selectedEmployeeId && (
        <EmployeeProfileModal
          userId={selectedEmployeeId}
          onClose={() => setSelectedEmployeeId(null)}
          onUpdated={() => {
            fetchStaff(currentPage);
            fetchAllStaff();
          }}
        />
      )}

      {/* DIRECT ATTENDANCE MODAL */}
      {showDirectAttendanceModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Direct Mark Attendance
                </h3>
              </div>
              <button
                onClick={() => setShowDirectAttendanceModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleDirectAttendanceSubmit}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Select Employee *
                </label>
                <select
                  required
                  className="w-full border rounded p-2 bg-white text-slate-800 font-medium"
                  value={directAttForm.employeeId}
                  onChange={(e) =>
                    setDirectAttForm({
                      ...directAttForm,
                      employeeId: e.target.value,
                    })
                  }
                >
                  <option value="">-- Choose Employee --</option>
                  {allStaff.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.employeeId || m.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  className="w-full border rounded p-2 bg-white text-slate-800"
                  value={directAttForm.date}
                  onChange={(e) =>
                    setDirectAttForm({
                      ...directAttForm,
                      date: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Clock In Time *
                  </label>
                  <input
                    type="time"
                    required
                    className="w-full border rounded p-2 bg-white text-slate-800"
                    value={directAttForm.startTime}
                    onChange={(e) =>
                      setDirectAttForm({
                        ...directAttForm,
                        startTime: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Clock Out Time *
                  </label>
                  <input
                    type="time"
                    required
                    className="w-full border rounded p-2 bg-white text-slate-800"
                    value={directAttForm.endTime}
                    onChange={(e) =>
                      setDirectAttForm({
                        ...directAttForm,
                        endTime: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Remarks / Reason
                </label>
                <input
                  type="text"
                  className="w-full border rounded p-2 bg-white text-slate-800"
                  placeholder="e.g. Outdoor client visit / Forgot punch"
                  value={directAttForm.remarks}
                  onChange={(e) =>
                    setDirectAttForm({
                      ...directAttForm,
                      remarks: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowDirectAttendanceModal(false)}
                  className="px-3.5 py-2 border rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={directAttLoading || !directAttForm.employeeId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50 transition"
                >
                  {directAttLoading ? "Marking..." : "Record Attendance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
