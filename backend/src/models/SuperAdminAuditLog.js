import mongoose from "mongoose";

const superAdminAuditLogSchema = new mongoose.Schema({
  who: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuperAdmin",
    default: null,
    index: true,
  },
  source: {
    type: String,
    enum: ["super-admin", "razorpay-webhook"],
    default: "super-admin",
  },
  action: { type: String, required: true, trim: true },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    default: null,
    index: true,
  },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  time: { type: Date, required: true, default: Date.now, index: true },
});

const SuperAdminAuditLog = mongoose.model(
  "SuperAdminAuditLog",
  superAdminAuditLogSchema,
);

export default SuperAdminAuditLog;
