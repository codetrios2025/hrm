import mongoose from "mongoose";
import { tenantQueryGuard } from "../plugins/tenantQueryGuard.js";

const leaveSchema = new mongoose.Schema(
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
    leaveType: {
      type: String,
      enum: [
        "casual",
        "sick",
        "paid",
        "oh",
        "lwp",
        "coff",
        "maternity",
        "paternity",
        "bereavement",
      ],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    daysCount: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    isHalfDay: { type: Boolean, default: false },
    halfDaySession: {
      type: String,
      enum: ["first", "second", null],
      default: null,
    },
    prescription: {
      originalName: {
        type: String,
        default: null,
      },

      fileName: {
        type: String,
        default: null,
      },

      path: {
        type: String,
        default: null,
      },

      mimetype: {
        type: String,
        default: null,
      },

      size: {
        type: Number,
        default: null,
      },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

leaveSchema.index({ tenantId: 1, status: 1, startDate: 1, endDate: 1 });
leaveSchema.index({ tenantId: 1, status: 1, updatedAt: 1 });
leaveSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
tenantQueryGuard(leaveSchema);

export const Leave = mongoose.model("Leave", leaveSchema);
