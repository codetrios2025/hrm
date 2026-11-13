import mongoose from "mongoose";
import { tenantQueryGuard } from "../plugins/tenantQueryGuard.js";

const attendanceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: { type: String, required: true, index: true },
    clockIn: { type: Date, required: true },
    clockOut: { type: Date, default: null },
    totalHours: { type: Number, default: 0 },
    activeMinutes: { type: Number, default: 5 }, // Starts with initial 5 mins on punch in
    lastActiveAt: { type: Date, default: Date.now },
    lastHeartbeatAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["in-progress", "present", "half-day", "short-leave", "absent"],
      default: "in-progress", // Default to in-progress when clocked in
    },
    ipAddress: { type: String },
  },
  { timestamps: true },
);

// Prevent multiple records for the same employee on the same date per tenant
attendanceSchema.index(
  { tenantId: 1, userId: 1, date: 1 },
  { unique: true },
);
attendanceSchema.index({ tenantId: 1, date: 1, userId: 1, status: 1 });
tenantQueryGuard(attendanceSchema);

export const Attendance = mongoose.model("Attendance", attendanceSchema);
