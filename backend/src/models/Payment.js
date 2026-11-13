import mongoose from "mongoose";
import { tenantQueryGuard } from "../plugins/tenantQueryGuard.js";

const paymentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
      index: true,
    },
    razorpayPaymentId: { type: String, required: true },
    razorpaySubscriptionId: { type: String, required: true },
    invoiceId: { type: String, default: null },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, required: true },
    paidAt: { type: Date, default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index(
  { tenantId: 1, razorpayPaymentId: 1 },
  { unique: true },
);
tenantQueryGuard(paymentSchema);

export default mongoose.model("Payment", paymentSchema);
