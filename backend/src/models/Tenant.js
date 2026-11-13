import mongoose from "mongoose";
import { DEFAULT_LEAVE_POLICY } from "../config/leavePolicy.js";

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["trial", "active", "suspended", "deleted"],
      default: "active",
    },
    plan: {
      type: String,
      enum: ["free", "basic", "pro"],
      default: "free",
    },
    employeeLimitOverride: {
      type: Number,
      min: 1,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    purgeAfter: {
      type: Date,
      default: null,
      index: true,
    },
    companyProfile: {
      website: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "India" },
    },
    leavePolicy: {
      casual: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.casual },
      sick: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.sick },
      paid: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.paid },
      oh: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.oh },
      coff: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.coff },
      maternity: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.maternity },
      paternity: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.paternity },
      bereavement: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.bereavement },
      lwp: { type: Number, min: 0, default: DEFAULT_LEAVE_POLICY.lwp },
    },
    onboarding: {
      completed: { type: Boolean, default: true },
      step: { type: Number, min: 1, max: 5, default: 5 },
      completedAt: { type: Date, default: null },
    },
    billing: {
      razorpaySubscriptionId: { type: String, default: null },
      status: {
        type: String,
        enum: [
          "inactive",
          "pending",
          "active",
          "halted",
          "suspended",
          "cancelled",
        ],
        default: "inactive",
      },
      currentPeriodEnd: { type: Date, default: null },
      graceUntil: { type: Date, default: null },
      lastProcessedAt: { type: Date, default: null },
      suspensionReason: { type: String, default: null },
    },
    proman: {
      baseUrl: {
        type: String,
        trim: true,
        default: null,
      },
      secret: {
        type: String,
        trim: true,
        select: false,
        default: null,
      },
    },
  },
  { timestamps: true },
);

tenantSchema.index(
  { "billing.razorpaySubscriptionId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "billing.razorpaySubscriptionId": { $type: "string" },
    },
  },
);

const Tenant = mongoose.model("Tenant", tenantSchema);

export default Tenant;
