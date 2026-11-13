import mongoose from "mongoose";
import { isValidTenantSlug } from "../config/slugPolicy.js";

const tenantRequestSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 63,
      validate: {
        validator: isValidTenantSlug,
        message: "Invalid or reserved company code",
      },
    },
    contactName: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    employeeCountEstimate: { type: Number, required: true, min: 1, max: 100000 },
    message: { type: String, trim: true, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false, index: true },
    ipAddress: { type: String, trim: true, maxlength: 128, default: "" },
    emailVerificationToken: {
      type: String,
      select: false,
      default: null,
      index: true,
    },
    emailVerificationExpires: { type: Date, select: false, default: null },
  },
  { timestamps: true },
);

tenantRequestSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
tenantRequestSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
tenantRequestSchema.index({ status: 1, emailVerified: 1, createdAt: 1 });

const TenantRequest = mongoose.model("TenantRequest", tenantRequestSchema);

export default TenantRequest;
