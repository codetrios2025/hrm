import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Upload,
  FileSpreadsheet,
  Download,
  FileText,
} from "lucide-react";

import api from "../api/client";
import Pagination from "./Pagination";

import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function OfficialHolidayManager() {
  const { user } = useAuth();

  const { showSuccess, showError } = useToast();

  /*
  |--------------------------------------------------------------------------
  | HR ADMIN CHECK
  |--------------------------------------------------------------------------
  */

  const isHRAdmin = user?.role === "admin" || user?.role === "hr";

  /*
  |--------------------------------------------------------------------------
  | State
  |--------------------------------------------------------------------------
  */

  const [holidays, setHolidays] = useState([]);

  const [pagination, setPagination] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);

  const [editingHoliday, setEditingHoliday] = useState(null);

  const [formData, setFormData] = useState({
    date: "",
    title: "",
    description: "",
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Fetch Holidays
  |--------------------------------------------------------------------------
  */

  const fetchHolidays = async (page = 1) => {
    try {
      setLoading(true);

      const res = await api.get(`/holidays?page=${page}&limit=10`);

      const responseData = res?.data || {};

      const data = responseData?.data || responseData;

      setHolidays(Array.isArray(data?.holidays) ? data.holidays : []);

      setPagination(data?.pagination || null);

      setCurrentPage(page);
    } catch (error) {
      console.error("Fetch holidays error:", error);

      showError(error?.message || "Unable to load official holidays");
    } finally {
      setLoading(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Initial Load
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (isHRAdmin) {
      fetchHolidays(currentPage);
    }
  }, [isHRAdmin, currentPage]);

  /*
  |--------------------------------------------------------------------------
  | Open Add Modal
  |--------------------------------------------------------------------------
  */

  const openAddModal = () => {
    setEditingHoliday(null);

    setFormData({
      date: "",
      title: "",
      description: "",
    });

    setShowModal(true);
  };

  /*
  |--------------------------------------------------------------------------
  | Open Edit Modal
  |--------------------------------------------------------------------------
  */

  const openEditModal = (holiday) => {
    setEditingHoliday(holiday);

    setFormData({
      date: holiday.date || "",
      title: holiday.title || "",
      description: holiday.description || "",
    });

    setShowModal(true);
  };

  /*
  |--------------------------------------------------------------------------
  | Close Modal
  |--------------------------------------------------------------------------
  */

  const closeModal = () => {
    if (saving) return;

    setShowModal(false);
    setEditingHoliday(null);

    setFormData({
      date: "",
      title: "",
      description: "",
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Form Change
  |--------------------------------------------------------------------------
  */

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /*
  |--------------------------------------------------------------------------
  | Submit
  |--------------------------------------------------------------------------
  */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.date) {
      showError("Please select holiday date");
      return;
    }

    if (!formData.title.trim()) {
      showError("Please enter holiday title");
      return;
    }

    setSaving(true);

    try {
      let response;

      if (editingHoliday) {
        response = await api.put(`/holidays/${editingHoliday._id}`, formData);

        showSuccess(response?.message || "Holiday updated successfully");
      } else {
        response = await api.post("/holidays", formData);

        showSuccess(response?.message || "Holiday added successfully");
      }

      closeModal();

      await fetchHolidays(editingHoliday ? currentPage : 1);
    } catch (error) {
      console.error("Save holiday error:", error);

      showError(error?.message || "Unable to save holiday");
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Delete
  |--------------------------------------------------------------------------
  */

  const handleDelete = async (holiday) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${holiday.title}"?`,
    );

    if (!confirmed) return;

    try {
      await api.delete(`/holidays/${holiday._id}`);

      showSuccess("Holiday deleted successfully");

      /*
      |--------------------------------------------------------------------------
      | If deleting the last record on current page,
      | go to previous page.
      |--------------------------------------------------------------------------
      */

      const currentCount = holidays.length;

      if (currentCount === 1 && currentPage > 1) {
        await fetchHolidays(currentPage - 1);
      } else {
        await fetchHolidays(currentPage);
      }
    } catch (error) {
      console.error("Delete holiday error:", error);

      showError(error?.message || "Unable to delete holiday");
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Format Date
  |--------------------------------------------------------------------------
  */

  const formatDate = (date) => {
    if (!date) return "-";

    const parsed = new Date(`${date}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Security
  |--------------------------------------------------------------------------
  */

  if (!isHRAdmin) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="text-center py-10">
          <div className="text-rose-600 font-semibold">Access Denied</div>

          <p className="text-sm text-slate-500 mt-1">
            Only HR Administrator can manage official holidays.
          </p>
        </div>
      </div>
    );
  }

  const handleImportHolidaysold = async () => {
    if (!importFile) {
      alert("Please select a CSV file.");
      return;
    }

    if (!importFile.name.toLowerCase().endsWith(".csv")) {
      alert("Only CSV files are allowed.");
      return;
    }

    try {
      setImporting(true);

      const formData = new FormData();

      formData.append("file", importFile);

      /*
    |--------------------------------------------------------------------------
    | Import Holiday CSV
    |--------------------------------------------------------------------------
    */

      const response = await api.post("/holidays/import", formData, {
        headers: {
          // Do NOT manually set Content-Type.
          // Axios will automatically set:
          // multipart/form-data; boundary=...
        },
      });

      const result = response.data;

      const imported = result?.data?.imported || 0;
      const skipped = result?.data?.skipped || 0;

      alert(
        `Holiday import completed.\n\nImported: ${imported}\nSkipped: ${skipped}`,
      );

      /*
    |--------------------------------------------------------------------------
    | Close modal
    |--------------------------------------------------------------------------
    */

      setShowImportModal(false);
      setImportFile(null);

      /*
    |--------------------------------------------------------------------------
    | Reload holiday list
    |--------------------------------------------------------------------------
    */

      await fetchHolidays();
    } catch (error) {
      console.error("Holiday import error:", error);

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to import holiday list.";

      alert(message);
    } finally {
      setImporting(false);
    }
  };

  const handleImportHolidays2 = async () => {
    if (!importFile) {
      alert("Please select a CSV file.");
      return;
    }

    if (!importFile.name.toLowerCase().endsWith(".csv")) {
      alert("Only CSV files are allowed.");
      return;
    }

    try {
      setImporting(true);

      const formData = new FormData();

      formData.append("file", importFile);

      const response = await api.post("/holidays/import", formData);

      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || "Holiday import failed.");
      }

      const imported = result?.data?.importedCount ?? 0;

      const skipped = result?.data?.skippedCount ?? 0;

      alert(
        `Holiday import completed.\n\nImported: ${imported}\nSkipped: ${skipped}`,
      );

      setShowImportModal(false);
      setImportFile(null);

      await fetchHolidays();
    } catch (error) {
      console.error("Holiday import error:", error);

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to import holiday list.";

      alert(message);
    } finally {
      setImporting(false);
    }
  };

  const handleImportHolidays3 = async () => {
    if (!importFile) {
      alert("Please select a CSV file.");
      return;
    }

    if (!importFile.name.toLowerCase().endsWith(".csv")) {
      alert("Only CSV files are allowed.");
      return;
    }

    try {
      setImporting(true);

      const formData = new FormData();

      formData.append("file", importFile);

      const response = await api.post("/holidays/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Holiday import response:", response);

      const result = response?.data;

      /*
    |--------------------------------------------------------------------------
    | API SUCCESS CHECK
    |--------------------------------------------------------------------------
    */

      if (!result?.success) {
        throw new Error(result?.message || "Holiday import failed.");
      }

      /*
    |--------------------------------------------------------------------------
    | IMPORTANT
    |--------------------------------------------------------------------------
    */

      const imported = result?.data?.importedCount ?? 0;

      const skipped = result?.data?.skippedCount ?? 0;

      const skippedRows = result?.data?.skipped ?? [];

      /*
    |--------------------------------------------------------------------------
    | RESULT MESSAGE
    |--------------------------------------------------------------------------
    */

      let message =
        `Holiday import completed.\n\n` +
        `Imported: ${imported}\n` +
        `Skipped: ${skipped}`;

      if (skippedRows.length > 0) {
        message += "\n\nSkipped Details:\n";

        skippedRows.forEach((item) => {
          message += `Row ${item.row}: ${item.reason}\n`;
        });
      }

      alert(message);

      /*
    |--------------------------------------------------------------------------
    | CLOSE MODAL
    |--------------------------------------------------------------------------
    */

      setShowImportModal(false);

      setImportFile(null);

      /*
    |--------------------------------------------------------------------------
    | RELOAD HOLIDAYS
    |--------------------------------------------------------------------------
    */

      await fetchHolidays();
    } catch (error) {
      console.error("Holiday import error:", error);

      /*
    |--------------------------------------------------------------------------
    | AXIOS ERROR RESPONSE
    |--------------------------------------------------------------------------
    */

      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to import holiday list.";

      alert(message);
    } finally {
      setImporting(false);
    }
  };

  const handleImportHolidays = async () => {
    if (!importFile) {
      alert("Please select a CSV file.");
      return;
    }

    if (!importFile.name.toLowerCase().endsWith(".csv")) {
      alert("Only CSV files are allowed.");
      return;
    }

    try {
      setImporting(true);

      const formData = new FormData();

      formData.append("file", importFile);

      /*
    |--------------------------------------------------------------------------
    | IMPORT HOLIDAY CSV
    |--------------------------------------------------------------------------
    */

      const response = await api.post("/holidays/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      /*
    |--------------------------------------------------------------------------
    | AXIOS RESPONSE
    |--------------------------------------------------------------------------
    |
    | response.data = backend JSON response
    |
    */

      const result = response.data;

      console.log("Holiday import response:", result);

      /*
    |--------------------------------------------------------------------------
    | CHECK API RESPONSE
    |--------------------------------------------------------------------------
    */

      if (result?.success === false) {
        throw new Error(result?.message || "Holiday import failed.");
      }

      /*
    |--------------------------------------------------------------------------
    | GET IMPORT RESULT
    |--------------------------------------------------------------------------
    */

      const imported = result?.data?.importedCount || 0;
      const skipped = result?.data?.skippedCount || 0;

      /*
    |--------------------------------------------------------------------------
    | SUCCESS MESSAGE
    |--------------------------------------------------------------------------
    */
      showSuccess(
        `Holiday import completed successfully.\n\n` +
          `Imported: ${imported}\n` +
          `Skipped: ${skipped}`,
      );
      // alert(
      //   `Holiday import completed successfully.\n\n` +
      //     `Imported: ${imported}\n` +
      //     `Skipped: ${skipped}`,
      // );

      /*
    |--------------------------------------------------------------------------
    | CLOSE MODAL
    |--------------------------------------------------------------------------
    */

      setShowImportModal(false);
      setImportFile(null);

      /*
    |--------------------------------------------------------------------------
    | RELOAD HOLIDAY LIST
    |--------------------------------------------------------------------------
    */

      await fetchHolidays();
    } catch (error) {
      console.error("Holiday import error:", error);

      /*
    |--------------------------------------------------------------------------
    | GET ERROR MESSAGE
    |--------------------------------------------------------------------------
    */

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to import holiday list.";

      alert(message);
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleHolidayCsv = () => {
    const csvContent = [
      "date,holiday,description",
      "02-10-2026,Gandhi Jayanti,Gandhi Jayanti",
      "20-10-2026,Dussehra,Dussehra",
      "26-01-2027,Republic Day,Republic Day",
      "15-08-2027,Independence Day,Independence Day",
      "25-12-2027,Christmas,Christmas Day",
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "official-holiday-sample.csv";

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-5">
      {/* Header */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-600" />

          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Official Holiday List
            </h2>

            <p className="text-xs text-slate-500">
              Manage official holidays for all employees.
            </p>
          </div>
        </div>
        {/* <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
        >
          <Upload className="w-4 h-4" />
          Import Holiday List
        </button>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
        >
          <Plus className="w-4 h-4" />
          Add Official Holiday
        </button> */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
          >
            <Upload className="w-4 h-4" />
            Import Holiday List
          </button>

          <button
            onClick={() => openAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Official Holiday
          </button>
        </div>
      </div>

      {/* Information */}

      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-800">
        Official holidays added here will be available to employee attendance
        sheets.
      </div>

      {/* Table */}

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left p-3 font-semibold text-slate-600">#</th>

              <th className="text-left p-3 font-semibold text-slate-600">
                Date
              </th>

              <th className="text-left p-3 font-semibold text-slate-600">
                Holiday
              </th>

              <th className="text-left p-3 font-semibold text-slate-600">
                Description
              </th>

              <th className="text-right p-3 font-semibold text-slate-600">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  Loading official holidays...
                </td>
              </tr>
            ) : holidays.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  No official holidays found.
                </td>
              </tr>
            ) : (
              holidays.map((holiday, index) => (
                <tr
                  key={holiday._id}
                  className="hover:bg-indigo-50/30 transition"
                >
                  <td className="p-3 text-slate-500">
                    {pagination
                      ? (pagination.page - 1) * pagination.limit + index + 1
                      : index + 1}
                  </td>

                  <td className="p-3">
                    <span className="font-medium text-slate-800">
                      {formatDate(holiday.date)}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="font-semibold text-slate-800">
                      {holiday.title}
                    </div>
                  </td>

                  <td className="p-3 text-slate-500 max-w-md">
                    {holiday.description || "-"}
                  </td>

                  <td className="p-3">
                    <div className="flex justify-end items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(holiday)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(holiday)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}

      <Pagination
        pagination={pagination}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* Add/Edit Modal */}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-slate-200">
            {/* Modal Header */}

            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800">
                  {editingHoliday
                    ? "Edit Official Holiday"
                    : "Add Official Holiday"}
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  Add the official holiday details.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Date */}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Holiday Date *
                </label>

                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* Title */}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Holiday Title *
                </label>

                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  maxLength={150}
                  placeholder="e.g. Gandhi Jayanti"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* Description */}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Description
                </label>

                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  maxLength={500}
                  rows={3}
                  placeholder="Optional holiday description"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />

                <div className="text-[10px] text-slate-400 mt-1 text-right">
                  {formData.description.length}/500
                </div>
              </div>

              {/* Buttons */}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {editingHoliday ? (
                    <Save className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}

                  {saving
                    ? "Saving..."
                    : editingHoliday
                      ? "Update Holiday"
                      : "Add Holiday"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Import Official Holiday List
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  Upload a CSV file containing official holidays.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-indigo-600 mt-0.5" />

                    <div>
                      <h4 className="font-semibold text-slate-800">
                        CSV Format
                      </h4>

                      <p className="text-xs text-indigo-600 mt-1">
                        date, holiday, description
                      </p>

                      <p className="text-xs text-indigo-600 mt-1">
                        Example: 02-10-2026, Gandhi Jayanti, Gandhi Jayanti
                      </p>
                    </div>
                  </div>

                  {/* Download Sample */}
                  <button
                    type="button"
                    onClick={downloadSampleHolidayCsv}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Sample
                  </button>
                </div>
              </div>

              {/* File Input */}
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select CSV File
              </label>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                }}
                className="block w-full text-sm text-slate-600 border border-slate-300 rounded-lg p-2"
              />

              {importFile && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm text-emerald-700">Selected file:</p>

                  <p className="font-semibold text-emerald-800">
                    {importFile.name}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-white"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleImportHolidays}
                disabled={!importFile || importing}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
              >
                <Upload className="w-4 h-4" />

                {importing ? "Importing..." : "Import Holidays"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
