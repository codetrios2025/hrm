import mongoose from "mongoose";
import { tenantQueryGuard } from "../plugins/tenantQueryGuard.js";

const outdoorDutySchema = new mongoose.Schema(
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
    date: {
      type: String,
      required: true,
    }, // Format: YYYY-MM-DD
    startTime: {
      type: String,
      required: true,
      trim: true,
    }, // Format: HH:mm (e.g., "09:30")
    endTime: {
      type: String,
      required: true,
      trim: true,
    }, // Format: HH:mm (e.g., "18:30")
    hours: {
      type: Number,
      min: 0.5,
      max: 24,
      default: 0,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

// Prevent multiple OD requests by the same employee for the exact same date per tenant
outdoorDutySchema.index(
  { tenantId: 1, userId: 1, date: 1 },
  { unique: true },
);
outdoorDutySchema.index({ tenantId: 1, status: 1, date: 1 });
outdoorDutySchema.index({ tenantId: 1, status: 1, createdAt: -1 });
tenantQueryGuard(outdoorDutySchema);

export const OutdoorDuty = mongoose.model("OutdoorDuty", outdoorDutySchema);
