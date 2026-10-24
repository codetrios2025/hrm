import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    date: {
      type: String,
      format: "YYYY-MM-DD",
      required: true,
      unique: true,
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

export default mongoose.model("Holiday", holidaySchema);
