import React, { useState, useEffect, useRef } from "react";
import {
  X,
  User as UserIcon,
  Phone,
  ShieldAlert,
  Save,
  Camera,
  Upload,
  FileText,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";

export default function EmployeeProfileModal({ userId, onClose, onUpdated }) {
  const [activeSubTab, setActiveSubTab] = useState("personal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const { showSuccess, showError } = useToast();

  // Document states
  const [documents, setDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [formData, setFormData] = useState({
    _id: "",
    avatar: "",
    firstName: "",
    middleName: "",
    lastName: "",
    employeeId: "",
    otherId: "",
    drivingLicenseNumber: "",
    licenseExpiryDate: "",
    gender: "Male",
    maritalStatus: "Single",
    nationality: "Indian",
    dateOfBirth: "",
    contact: {
      street1: "",
      street2: "",
      city: "",
      state: "",
      zipCode: "",
      country: "India",
      homePhone: "",
      mobilePhone: "",
      workPhone: "",
      workEmail: "",
      otherEmail: "",
    },
    emergencyContact: {
      name: "",
      relationship: "",
      phone: "",
    },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const url = userId
          ? `/users/profile?userId=${userId}`
          : `/users/profile`;
        const res = await api.get(url);
        const user = res.data?.data || res.data;

        setDocuments(user.documents || []);

        setFormData({
          _id: user._id || userId || "",
          avatar: user.avatar || "",
          firstName: user.firstName || user.name?.split(" ")[0] || "",
          middleName: user.middleName || "",
          lastName:
            user.lastName || user.name?.split(" ").slice(1).join(" ") || "",
          employeeId: user.employeeId || "",
          otherId: user.otherId || "",
          drivingLicenseNumber: user.drivingLicenseNumber || "",
          licenseExpiryDate: user.licenseExpiryDate || "",
          gender: user.gender || "Male",
          maritalStatus: user.maritalStatus || "Single",
          nationality: user.nationality || "Indian",
          dateOfBirth: user.dateOfBirth || "",
          contact: {
            street1: user.contact?.street1 || "",
            street2: user.contact?.street2 || "",
            city: user.contact?.city || "",
            state: user.contact?.state || "",
            zipCode: user.contact?.zipCode || "",
            country: user.contact?.country || "India",
            homePhone: user.contact?.homePhone || "",
            mobilePhone: user.contact?.mobilePhone || "",
            workPhone: user.contact?.workPhone || "",
            workEmail: user.contact?.workEmail || user.email || "",
            otherEmail: user.contact?.otherEmail || "",
          },
          emergencyContact: {
            name: user.emergencyContact?.name || "",
            relationship: user.emergencyContact?.relationship || "",
            phone: user.emergencyContact?.phone || "",
          },
        });
      } catch (err) {
        showError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  const handleChange = (e, section) => {
    const { name, value } = e.target;
    if (section) {
      setFormData((prev) => ({
        ...prev,
        [section]: { ...prev[section], [name]: value },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === "employeeId" ? value.toUpperCase() : value,
      }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return showError("Please choose a valid image file (JPG, PNG)");
    }

    if (file.size > 2 * 1024 * 1024) {
      return showError("Image size must be less than 2MB");
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, avatar: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!docFile || !docTitle.trim()) {
      showError("Please provide both a document title and file.");
      return;
    }

    const data = new FormData();
    data.append("title", docTitle.trim());
    data.append("document", docFile);

    setUploadingDoc(true);
    try {
      const targetUserId = userId || formData._id;
      const res = await api.post(`/users/${targetUserId}/documents`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showSuccess("Document uploaded successfully!");
      setDocuments(res.data?.data || res.data || []);
      setDocTitle("");
      setDocFile(null);
    } catch (err) {
      showError(err.message || "Failed to upload document");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?"))
      return;

    try {
      const targetUserId = userId || formData._id;
      const res = await api.delete(`/users/${targetUserId}/documents/${docId}`);
      showSuccess("Document deleted successfully");
      setDocuments(res.data?.data || res.data || []);
    } catch (err) {
      showError(err.message || "Failed to delete document");
    }
  };

  const handleViewDocument = async (doc) => {
    if (!doc.fileName) {
      showError("Document file is not available.");
      return;
    }

    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      showError("Allow pop-ups to view this document.");
      return;
    }

    try {
      const blob = await api.get(
        `/uploads/documents/${encodeURIComponent(doc.fileName)}`,
        { responseType: "blob" },
      );
      const blobUrl = window.URL.createObjectURL(blob);
      previewWindow.opener = null;
      previewWindow.location.href = blobUrl;
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      previewWindow.close();
      showError(err.message || "Failed to open document");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        ...(userId ? { userId } : {}),
      };
      const res = await api.put("/users/profile", payload);
      showSuccess(res.message || "Profile updated successfully");
      if (onUpdated) onUpdated(res.data?.data || res.data);
      onClose();
    } catch (err) {
      showError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4">
        <div className="bg-white p-6 rounded-xl shadow-lg text-sm text-slate-600">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm sm:p-4">
      <div className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:h-auto sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-800 sm:text-base">
              Employee Profile: {formData.firstName} {formData.lastName}
            </h2>
            <p className="truncate text-xs text-slate-500 font-mono">
              ID: {formData.employeeId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close employee profile"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Sidebar */}
          <aside className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-slate-50 p-2 sm:gap-4 sm:p-4 md:w-56 md:border-b-0 md:border-r">
            <div className="flex shrink-0 flex-row items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:gap-3 sm:p-3 md:flex-col">
              <div className="relative group mb-0 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-300 bg-slate-100 sm:h-14 sm:w-14 md:mb-2 md:h-28 md:w-24">
                {formData.avatar ? (
                  <img
                    src={formData.avatar}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-6 w-6 text-slate-400 md:h-12 md:w-12" />
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Change profile photo"
                  className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-slate-900/60 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100"
                >
                  <Camera className="w-4 h-4 mb-1" />
                  <span className="hidden md:inline">Change</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />

              <div className="min-w-0 md:text-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Photo</span>
                </button>
                <p className="mt-0.5 text-[9px] text-slate-400">
                  JPG, PNG up to 2MB
                </p>
              </div>
            </div>

            <div className="flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain md:flex-col md:overflow-visible">
              <button
                type="button"
                onClick={() => setActiveSubTab("personal")}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold transition md:w-full ${
                  activeSubTab === "personal"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <UserIcon className="w-4 h-4" />
                <span>Personal Details</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab("contact")}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold transition md:w-full ${
                  activeSubTab === "contact"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>Contact Details</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab("emergency")}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold transition md:w-full ${
                  activeSubTab === "emergency"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Emergency Contacts</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab("documents")}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-semibold transition md:w-full ${
                  activeSubTab === "documents"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Required Documents</span>
              </button>
            </div>
          </aside>

          {/* Form Content */}
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-4 overflow-y-auto p-3 sm:p-6"
          >
            <div className="space-y-4">
              {activeSubTab === "personal" && (
                <div className="space-y-4 text-xs">
                  <h3 className="text-sm font-semibold text-slate-800 border-b pb-2">
                    Personal Details
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Middle Name
                      </label>
                      <input
                        type="text"
                        name="middleName"
                        value={formData.middleName}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Employee ID
                      </label>
                      <input
                        type="text"
                        value={formData.employeeId}
                        name="employeeId"
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Other ID
                      </label>
                      <input
                        type="text"
                        name="otherId"
                        value={formData.otherId}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Driver's License Number
                      </label>
                      <input
                        type="text"
                        name="drivingLicenseNumber"
                        value={formData.drivingLicenseNumber}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        License Expiry Date
                      </label>
                      <input
                        type="date"
                        name="licenseExpiryDate"
                        value={formData.licenseExpiryDate}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Gender
                      </label>
                      <div className="flex gap-4 items-center mt-1">
                        {["Male", "Female", "Other"].map((g) => (
                          <label
                            key={g}
                            className="flex items-center gap-1.5 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="gender"
                              value={g}
                              checked={formData.gender === g}
                              onChange={handleChange}
                            />
                            <span>{g}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Marital Status
                      </label>
                      <select
                        name="maritalStatus"
                        value={formData.maritalStatus}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Nationality
                      </label>
                      <input
                        type="text"
                        name="nationality"
                        value={formData.nationality}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        name="dateOfBirth"
                        value={formData.dateOfBirth}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "contact" && (
                <div className="space-y-4 text-xs">
                  <h3 className="text-sm font-semibold text-slate-800 border-b pb-2">
                    Contact Details
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Address Street 1
                      </label>
                      <input
                        type="text"
                        name="street1"
                        value={formData.contact.street1}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Address Street 2
                      </label>
                      <input
                        type="text"
                        name="street2"
                        value={formData.contact.street2}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-slate-600 mb-1">City</label>
                      <input
                        type="text"
                        name="city"
                        value={formData.contact.city}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        State / Province
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={formData.contact.state}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Zip / Postal Code
                      </label>
                      <input
                        type="text"
                        name="zipCode"
                        value={formData.contact.zipCode}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Mobile Phone
                      </label>
                      <input
                        type="text"
                        name="mobilePhone"
                        value={formData.contact.mobilePhone}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Work Telephone
                      </label>
                      <input
                        type="text"
                        name="workPhone"
                        value={formData.contact.workPhone}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Home Telephone
                      </label>
                      <input
                        type="text"
                        name="homePhone"
                        value={formData.contact.homePhone}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Work Email
                      </label>
                      <input
                        type="email"
                        name="workEmail"
                        value={formData.contact.workEmail}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Other Email
                      </label>
                      <input
                        type="email"
                        name="otherEmail"
                        value={formData.contact.otherEmail}
                        onChange={(e) => handleChange(e, "contact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "emergency" && (
                <div className="space-y-4 text-xs">
                  <h3 className="text-sm font-semibold text-slate-800 border-b pb-2">
                    Emergency Contacts
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.emergencyContact.name}
                        onChange={(e) => handleChange(e, "emergencyContact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Relationship
                      </label>
                      <input
                        type="text"
                        name="relationship"
                        value={formData.emergencyContact.relationship}
                        onChange={(e) => handleChange(e, "emergencyContact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        name="phone"
                        value={formData.emergencyContact.phone}
                        onChange={(e) => handleChange(e, "emergencyContact")}
                        className="w-full px-3 py-2 border rounded-lg text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "documents" && (
                <div className="space-y-6">
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold text-slate-800">
                      Upload New Document
                    </h3>
                    <p className="text-xs text-slate-500">
                      Attach verification proofs, certificates, or agreements.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div>
                        <input
                          type="text"
                          placeholder="Document Title (e.g., Aadhaar, PAN)"
                          value={docTitle}
                          onChange={(e) => setDocTitle(e.target.value)}
                          className="w-full border rounded p-2 text-xs text-slate-800 bg-white"
                        />
                      </div>
                      <div>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => setDocFile(e.target.files[0])}
                          className="w-full min-w-0 border rounded p-1.5 text-xs text-slate-700 bg-white"
                        />
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={handleUploadDocument}
                          disabled={uploadingDoc}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded text-xs transition disabled:opacity-50"
                        >
                          {uploadingDoc ? "Uploading..." : "Upload Document"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3">
                      Uploaded Documents
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {documents.map((doc) => (
                        <div
                          key={doc._id}
                          className="flex flex-col gap-3 rounded-xl border bg-slate-50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <FileText className="w-4 h-4 text-indigo-600" />
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 block">
                                {doc.title}
                              </span>
                              <span className="block break-all text-[10px] text-slate-400">
                                {doc.originalName}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewDocument(doc)}
                              className="px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded font-semibold transition"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc._id)}
                              className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded font-semibold transition"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                      {documents.length === 0 && (
                        <p className="text-center text-slate-400 py-8">
                          No documents uploaded yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
