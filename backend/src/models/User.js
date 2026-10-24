import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../constants/roles.js";
const crypto = await import("crypto");

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.EMPLOYEE },
    // Personal Details
    firstName: { type: String },
    middleName: { type: String },
    lastName: { type: String },
    otherId: { type: String },
    drivingLicenseNumber: { type: String },
    licenseExpiryDate: { type: String },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    maritalStatus: {
      type: String,
      enum: ["Single", "Married", "Other"],
      default: "Single",
    },
    nationality: { type: String, default: "Indian" },
    dateOfBirth: { type: String },
    avatar: {
      type: String, // Stores base64 data URL or uploaded image URL
      default: "",
    },
    // Contact Details
    contact: {
      street1: { type: String },
      street2: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String, default: "India" },
      homePhone: { type: String },
      mobilePhone: { type: String },
      workPhone: { type: String },
      workEmail: { type: String },
      otherEmail: { type: String },
    },

    // Emergency Contact
    emergencyContact: {
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
    },

    // Job / Position Details
    jobTitle: { type: String },
    department: { type: String },
    joinDate: { type: String },
    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: { type: Boolean, default: true }, // Status flag
    leaveBalance: {
      casual: { type: Number, default: 10, min: 0 },
      sick: { type: Number, default: 8, min: 0 },
      paid: { type: Number, default: 12, min: 0 },
      oh: { type: Number, default: 2, min: 0 },
      coff: { type: Number, default: 0, min: 0 },
      maternity: { type: Number, default: 182, min: 0 },
      paternity: { type: Number, default: 3, min: 0 },
      bereavement: { type: Number, default: 3, min: 0 },
      lwp: { type: Number, default: 0, min: 0 },
    },
    documents: [
      {
        title: { type: String, required: true },
        fileName: { type: String, required: true },
        originalName: { type: String, required: true },
        path: { type: String, required: true },
        mimetype: { type: String },
        size: { type: Number },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  return resetToken;
};

export const User = mongoose.model("User", userSchema);
