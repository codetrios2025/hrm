import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { connectDB } from "../src/config/db.js";
import Tenant from "../src/models/Tenant.js";

export const seedDefaultTenant = async () => {
  await Tenant.init();

  return Tenant.findOneAndUpdate(
    { slug: "default" },
    {
      $set: {
        status: "active",
        trialEndsAt: null,
      },
      $setOnInsert: {
        name: "Default",
        plan: "free",
        employeeLimitOverride: null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  );
};

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await connectDB();
  try {
    const tenant = await seedDefaultTenant();
    console.log(`[Tenant Seed] Default tenant ready: ${tenant._id}`);
  } finally {
    await mongoose.disconnect();
  }
}
