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
} from "lucide-react";
import api from "../api/client";
import Pagination from "./Pagination";
import { useToast } from "../context/ToastContext";
import EmployeeProfileModal from "./EmployeeProfileModal";

export default function AdminPanel() {
  const [staff, setStaff] = useState([]);
  const [allStaff, setAllStaff] = useState([]); // Holds complete staff roster for modal dropdowns
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

  // Single Staff Creation State
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

  // Report Filter State
  const currentDate = new Date();
  const [reportEmployeeId, setReportEmployeeId] = useState("all");
  const [reportMonth, setReportMonth] = useState(currentDate.getMonth() + 1);
  const [reportYear, setReportYear] = useState(currentDate.getFullYear());
  const [downloading, setDownloading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null); // For EmployeeProfileModal

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
      const res = await api.get(`/admin/staff?page=${page}&limit=5`);
      setStaff(res.data.staff);
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
      });
      fetchStaff(1);
      fetchAllStaff();
    } catch (err) {
      showError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle CSV Bulk Upload
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
        `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/admin/bulk-import`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
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

  // Handle HR Admin Direct Leave Application
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

  // Direct Mark Attendance
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

  // Download sample CSV format
  const downloadSampleCsv = () => {
    const sampleHeaders =
      "employeeId,name,email,role,reportingManagerEmployeeId,casualLeave,sickLeave,paidLeave,optionalHoliday\n";
    const sampleRows =
      "EMP001,Amit Kumar,amit@company.com,employee,MGR001,12,8,15,2\nMGR001,Rajesh Verma,rajesh@company.com,manager,,12,8,15,2\n";
    const blob = new Blob([sampleHeaders + sampleRows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk_employee_sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const queryParams = new URLSearchParams({
        employeeId: reportEmployeeId,
        month: reportMonth,
        year: reportYear,
      }).toString();

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/admin/export-attendance?${queryParams}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) throw new Error("Failed to download attendance file");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Attendance_Report_${reportEmployeeId}_${reportYear}_${reportMonth}.csv`;
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

  const handleTriggerRollover = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to execute Year-End Leave Rollover? Casual Leave (CL) will become 0 and all remaining OH will convert into Paid Leave.",
    );
    if (!confirmed) return;

    try {
      const res = await api.post("/admin/trigger-year-end-rollover");
      showSuccess(res.message || "Year-end rollover executed successfully!");
      fetchStaff(currentPage);
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            HR Admin Control Panel
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Apply Leave for Staff Button */}
          <button
            onClick={() => setShowAdminLeaveModal(true)}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Calendar className="w-4 h-4" />
            <span>Apply Leave for Staff</span>
          </button>

          {/* Direct Mark Attendance Button */}
          <button
            onClick={() => setShowDirectAttendanceModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Clock className="w-4 h-4" />
            <span>Direct Mark Attendance</span>
          </button>

          {/* Bulk Import Button */}
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Bulk Import (.CSV)</span>
          </button>

          {/* Add Staff Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Single Staff</span>
          </button>
        </div>
      </div>

      {/* Export Attendance Report Widget */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-xs text-slate-800 uppercase tracking-wider">
            Export Attendance Report (.CSV / Excel)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
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

      {/* Staff Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
              <th className="p-3">Emp ID</th>
              <th className="p-3">Employee</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Assigned Approver (Manager)</th>
              <th className="p-3">Balances (C / S / P / OH)</th>
              <th className="p-3 text-right whitespace-nowrap min-w-[220px]">
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
                  <div className="flex gap-1 font-medium text-[11px]">
                    <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                      C: {member.leaveBalance?.casual ?? 0}
                    </span>
                    <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                      S: {member.leaveBalance?.sick ?? 0}
                    </span>
                    <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                      P: {member.leaveBalance?.paid ?? 0}
                    </span>
                    <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                      OH: {member.leaveBalance?.oh ?? 2}
                    </span>
                  </div>
                </td>
                <td className="p-3 text-right whitespace-nowrap min-w-[220px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handleToggleStatus(member._id)}
                      className={`h-7 px-2.5 rounded text-[11px] font-semibold border transition inline-flex items-center justify-center shrink-0 ${
                        member.isActive !== false
                          ? "text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100"
                          : "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                      }`}
                      title={
                        member.isActive !== false
                          ? "Deactivate User"
                          : "Activate User"
                      }
                    >
                      {member.isActive !== false ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => openEditModal(member)}
                      className="h-7 px-2.5 rounded text-[11px] font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-indigo-600 transition inline-flex items-center gap-1 shrink-0"
                      title="Edit User Details"
                    >
                      <UserPen className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(member);
                        setBalanceForm({
                          leaveType: "oh",
                          amount: member.leaveBalance?.oh ?? 2,
                        });
                      }}
                      className="h-7 px-2.5 rounded text-[11px] font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition inline-flex items-center gap-1 shrink-0"
                      title="Adjust Quota"
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
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-400">
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

      {/* Modal: Bulk CSV Import */}
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

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] leading-relaxed">
                <strong>Strict All-or-Nothing Rule:</strong> If any row contains
                errors (invalid role, duplicated email or employeeId), the
                entire file will be rejected and no changes will be made.
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

      {/* Modal: Single Staff Creation */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Add New Staff Member
                </h3>
                <p className="text-xs text-slate-500">
                  Credentials will be emailed automatically.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Employee ID (Unique)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP001"
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
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    className="w-full border rounded p-2 text-slate-800"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="john.doe@company.com"
                  className="w-full border rounded p-2 text-slate-800"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, email: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Assigned Manager
                  </label>
                  <select
                    className="w-full border rounded p-2 bg-white text-slate-800"
                    value={createForm.reportingManager}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        reportingManager: e.target.value,
                      })
                    }
                  >
                    <option value="">None (Self/Director)</option>
                    {managers.map((mgr) => (
                      <option key={mgr._id} value={mgr._id}>
                        {mgr.name} ({mgr.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Initial Leave Balances
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500">Casual</span>
                    <input
                      type="number"
                      min="0"
                      className="w-full border rounded p-1.5"
                      value={createForm.casualLeave}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          casualLeave: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Sick</span>
                    <input
                      type="number"
                      min="0"
                      className="w-full border rounded p-1.5"
                      value={createForm.sickLeave}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          sickLeave: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Paid</span>
                    <input
                      type="number"
                      min="0"
                      className="w-full border rounded p-1.5"
                      value={createForm.paidLeave}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          paidLeave: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">OH</span>
                    <input
                      type="number"
                      min="0"
                      className="w-full border rounded p-1.5"
                      value={createForm.optionalHoliday}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          optionalHoliday: Number(e.target.value),
                        })
                      }
                    />
                  </div>
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

      {/* Modal: HR Admin Force Apply Leave */}
      {showAdminLeaveModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Apply Leave for Employee
                </h3>
                <p className="text-xs text-slate-500">
                  Record unapplied or retroactive absence as leave.
                </p>
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
                  className="w-full border rounded p-2 bg-white text-slate-800 font-medium"
                  value={adminLeaveForm.leaveType}
                  onChange={(e) =>
                    setAdminLeaveForm({
                      ...adminLeaveForm,
                      leaveType: e.target.value,
                    })
                  }
                >
                  <option value="casual">Casual Leave (CL)</option>
                  <option value="paid">Paid Leave (PL)</option>
                  <option value="sick">Sick Leave (SL)</option>
                  <option value="oh">Optional Holiday (OH)</option>
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
                  rows={2}
                  required
                  placeholder="e.g. Employee informed via phone call / emergency absence"
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

      {/* Modal: Edit Staff */}
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

      {/* Modal: Adjust Quota */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-lg border border-slate-200">
            <h3 className="font-semibold text-slate-800 text-sm mb-1">
              Adjust Quota: {selectedUser.name} ({selectedUser.employeeId})
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
                  className="w-full border rounded p-2 bg-white"
                  value={balanceForm.leaveType}
                  onChange={(e) =>
                    setBalanceForm({
                      leaveType: e.target.value,
                      amount:
                        selectedUser.leaveBalance?.[e.target.value] ??
                        (e.target.value === "oh" ? 2 : 0),
                    })
                  }
                >
                  <option value="paid">Paid Leave</option>
                  <option value="casual">Casual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="oh">Optional Holiday (OH)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">
                  New Balance Days
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  className="w-full border rounded p-2 text-slate-800"
                  value={balanceForm.amount}
                  onChange={(e) =>
                    setBalanceForm({ ...balanceForm, amount: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
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

      {/* Employee Profile Modal */}
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

      {/* Modal: Direct Mark Attendance */}
      {showDirectAttendanceModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Direct Mark Attendance
                </h3>
                <p className="text-xs text-slate-500">
                  Add or override punch in & out for any staff member.
                </p>
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
                    setDirectAttForm({ ...directAttForm, date: e.target.value })
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
                  placeholder="e.g. Outdoor client visit / Forgot punch card"
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
