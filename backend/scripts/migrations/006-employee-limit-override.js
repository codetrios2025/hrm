import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { connectDB } from "../../src/config/db.js";
import { PLANS } from "../../src/config/plans.js";
import Tenant from "../../src/models/Tenant.js";

export const migrateEmployeeLimitOverrides = async ({ dryRun = false } = {}) => {
  const legacyTenants = await Tenant.collection
    .find({ employeeLimit: { $exists: true } })
    .toArray();
  let customOverrides = 0;
  let planDefaults = 0;

  for (const tenant of legacyTenants) {
    const planLimit = PLANS[tenant.plan]?.employeeLimit;
    if (!planLimit) {
      throw new Error(
        `Cannot migrate tenant ${tenant._id}: unknown plan "${tenant.plan}"`,
      );
    }

    const override = Object.hasOwn(tenant, "employeeLimitOverride")
      ? tenant.employeeLimitOverride
      : tenant.employeeLimit === planLimit
        ? null
        : tenant.employeeLimit;
    if (override == null) planDefaults++;
    else customOverrides++;

    if (!dryRun) {
      await Tenant.collection.updateOne(
        { _id: tenant._id, employeeLimit: tenant.employeeLimit },
        {
          $set: { employeeLimitOverride: override },
          $unset: { employeeLimit: "" },
        },
      );
    }
  }

  return {
    tenantsToMigrate: legacyTenants.length,
    planDefaults,
    customOverrides,
    dryRun,
  };
};

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await connectDB();
  try {
    const result = await migrateEmployeeLimitOverrides({
      dryRun: process.argv.includes("--dry-run"),
    });
    console.log("[Migration 006] Employee limit overrides:", result);
  } finally {
    await mongoose.disconnect();
  }
}
