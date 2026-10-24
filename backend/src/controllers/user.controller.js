import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import fs from "fs";
import path from "path";

// Fetch single profile (user fetches own, admin can pass ?userId=...)
export const getProfile = asyncHandler(async (req, res) => {
  const targetUserId =
    req.user.role === "admin" && req.query.userId
      ? req.query.userId
      : req.user._id;

  const profile = await User.findById(targetUserId).select("-password");
  if (!profile) {
    throw new ApiError(404, "User not found");
  }

  return ApiResponse.send(res, 200, profile, "Profile fetched successfully");
});

// Update profile
export const updateProfileold = asyncHandler(async (req, res) => {
  const targetUserId =
    req.user.role === "admin" && req.body.userId
      ? req.body.userId
      : req.user._id;

  const user = await User.findById(targetUserId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const {
    firstName,
    middleName,
    lastName,
    otherId,
    drivingLicenseNumber,
    licenseExpiryDate,
    gender,
    maritalStatus,
    nationality,
    dateOfBirth,
    contact,
    emergencyContact,
    jobTitle,
    department,
  } = req.body;

  // Personal details
  if (firstName !== undefined) user.firstName = firstName;
  if (middleName !== undefined) user.middleName = middleName;
  if (lastName !== undefined) user.lastName = lastName;
  user.name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;

  if (otherId !== undefined) user.otherId = otherId;
  if (drivingLicenseNumber !== undefined)
    user.drivingLicenseNumber = drivingLicenseNumber;
  if (licenseExpiryDate !== undefined)
    user.licenseExpiryDate = licenseExpiryDate;
  if (gender !== undefined) user.gender = gender;
  if (maritalStatus !== undefined) user.maritalStatus = maritalStatus;
  if (nationality !== undefined) user.nationality = nationality;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;

  // Contact details
  if (contact) {
    user.contact = {
      ...user.contact,
      ...contact,
    };
  }

  // Emergency contact
  if (emergencyContact) {
    user.emergencyContact = {
      ...user.emergencyContact,
      ...emergencyContact,
    };
  }

  // Admin-only fields
  if (req.user.role === "admin") {
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (department !== undefined) user.department = department;
    if (req.body.role !== undefined) user.role = req.body.role;
  }

  await user.save();
  const updatedUser = await User.findById(user._id).select("-password");

  return ApiResponse.send(
    res,
    200,
    updatedUser,
    "Profile updated successfully",
  );
});

export const updateProfile = asyncHandler(async (req, res) => {
  const targetUserId =
    req.user.role === "admin" && req.body.userId
      ? req.body.userId
      : req.user._id;

  const user = await User.findById(targetUserId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const {
    avatar, // <-- Added avatar
    firstName,
    middleName,
    lastName,
    employeeId,
    otherId,
    drivingLicenseNumber,
    licenseExpiryDate,
    gender,
    maritalStatus,
    nationality,
    dateOfBirth,
    contact,
    emergencyContact,
    jobTitle,
    department,
  } = req.body;

  // Update profile avatar image if provided
  if (avatar !== undefined) {
    user.avatar = avatar;
  }

  // Personal details
  if (firstName !== undefined) user.firstName = firstName;
  if (middleName !== undefined) user.middleName = middleName;
  if (lastName !== undefined) user.lastName = lastName;
  user.name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;

  if (employeeId !== undefined) user.employeeId = employeeId;
  if (otherId !== undefined) user.otherId = otherId;
  if (drivingLicenseNumber !== undefined)
    user.drivingLicenseNumber = drivingLicenseNumber;
  if (licenseExpiryDate !== undefined)
    user.licenseExpiryDate = licenseExpiryDate;
  if (gender !== undefined) user.gender = gender;
  if (maritalStatus !== undefined) user.maritalStatus = maritalStatus;
  if (nationality !== undefined) user.nationality = nationality;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;

  if (contact) {
    user.contact = { ...user.contact, ...contact };
  }

  if (emergencyContact) {
    user.emergencyContact = { ...user.emergencyContact, ...emergencyContact };
  }

  if (req.user.role === "admin") {
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (department !== undefined) user.department = department;
    if (req.body.role !== undefined) user.role = req.body.role;
  }

  await user.save();
  const updatedUser = await User.findById(user._id).select("-password");

  return ApiResponse.send(
    res,
    200,
    updatedUser,
    "Profile updated successfully",
  );
});

export const uploadEmployeeDocument = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { title } = req.body;

  if (!req.file) {
    throw new ApiError(400, "Please select a document file to upload");
  }

  if (!title) {
    throw new ApiError(400, "Document title is required");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "Employee not found");
  }

  const newDoc = {
    title,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    path: `/uploads/documents/${req.file.filename}`,
    mimetype: req.file.mimetype,
    size: req.file.size,
  };

  user.documents.push(newDoc);
  await user.save();

  return ApiResponse.send(
    res,
    201,
    user.documents,
    "Document uploaded successfully",
  );
});

// B. Delete Employee Document
export const deleteEmployeeDocument = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "Employee not found");
  }

  const doc = user.documents.id(docId);
  if (!doc) {
    throw new ApiError(404, "Document not found");
  }

  // Remove file from disk if exists
  const filePath = path.join(process.cwd(), doc.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  user.documents.pull(docId);
  await user.save();

  return ApiResponse.send(
    res,
    200,
    user.documents,
    "Document deleted successfully",
  );
});
