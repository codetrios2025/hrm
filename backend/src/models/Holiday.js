import mongoose from "mongoose";
import { tenantQueryGuard } from "../plugins/tenantQueryGuard.js";

const holidaySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      immutable: true,
      index: true,
    },
    date: {
      type: String,
      format: "YYYY-MM-DD",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

holidaySchema.index({ tenantId: 1, date: 1 }, { unique: true });
tenantQueryGuard(holidaySchema);

export default mongoose.model("Holiday", holidaySchema);
