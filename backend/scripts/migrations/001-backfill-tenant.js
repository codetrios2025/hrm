import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { connectDB } from "../../src/config/db.js";
import { Attendance } from "../../src/models/Attendance.js";
import Holiday from "../../src/models/Holiday.js";
import { Leave } from "../../src/models/Leave.js";
import { OutdoorDuty } from "../../src/models/OutdoorDuty.js";
import Tenant from "../../src/models/Tenant.js";
import { User } from "../../src/models/User.js";
import { runWithTenantQueryBypass } from "../../src/plugins/tenantQueryGuard.js";

const tenantCollections = [
  { name: "users", model: User },
  { name: "attendances", model: Attendance },
  { name: "leaves", model: Leave },
  { name: "outdoorDuties", model: OutdoorDuty },
  { name: "holidays", model: Holiday },
];

const tenantReferences = [
  { name: "User.reportingManager", model: User, field: "reportingManager" },
  { name: "Attendance.userId", model: Attendance, field: "userId" },
  { name: "Leave.userId", model: Leave, field: "userId" },
  { name: "Leave.reviewedBy", model: Leave, field: "reviewedBy" },
  { name: "OutdoorDuty.userId", model: OutdoorDuty, field: "userId" },
  { name: "OutdoorDuty.reviewedBy", model: OutdoorDuty, field: "reviewedBy" },
];

const missingTenantFilter = {
  $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
};

const countCrossTenantReferences = async ({ model, field }, tenantId) => {
  const [result] = await model.aggregate([
    { $match: { [field]: { $ne: null } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: field,
        foreignField: "_id",
        as: "_tenantBackfillUser",
      },
    },
    { $unwind: "$_tenantBackfillUser" },
    {
      $match: {
        $expr: {
          $ne: [
            { $ifNull: ["$tenantId", tenantId] },
            { $ifNull: ["$_tenantBackfillUser.tenantId", tenantId] },
          ],
        },
      },
    },
    { $count: "count" },
  ]);

  return result?.count ?? 0;
};

const getCollectionCounts = async () =>
  Object.fromEntries(
    await Promise.all(
      tenantCollections.map(async ({ name, model }) => {
        const [total, missingTenantId] = await Promise.all([
          model.countDocuments({}),
          model.countDocuments(missingTenantFilter),
        ]);
        return [name, { total, missingTenantId }];
      }),
    ),
  );

const getReferenceCounts = async (tenantId) =>
  Object.fromEntries(
    await Promise.all(
      tenantReferences.map(async (reference) => [
        reference.name,
        await countCrossTenantReferences(reference, tenantId),
      ]),
    ),
  );

const countTotal = (counts) =>
  Object.values(counts).reduce((total, count) => total + count, 0);

const printCounts = (counts) => {
  console.log(JSON.stringify(counts, null, 2));
};

export const backfillTenant = async ({ dryRun = false } = {}) =>
  runWithTenantQueryBypass("migration", async () => {
    const defaultTenant = await Tenant.findOne({ slug: "default" });
    if (!defaultTenant) {
      throw new Error(
        "Default tenant not found. Run scripts/seedDefaultTenant.js first.",
      );
    }

    const initialCollections = await getCollectionCounts();
    const referenceViolations = await getReferenceCounts(defaultTenant._id);
    const summary = {
      collections: initialCollections,
      crossTenantReferences: referenceViolations,
    };

    if (dryRun) {
      printCounts(summary);
      return summary;
    }

    const violations = countTotal(referenceViolations);
    if (violations > 0) {
      throw new Error(
        `Tenant backfill aborted: ${violations} cross-tenant reference(s) found.`,
      );
    }

    await Promise.all(
      tenantCollections.map(({ model }) =>
        model.updateMany(
          missingTenantFilter,
          { $set: { tenantId: defaultTenant._id } },
          { overwriteImmutable: true },
        ),
      ),
    );

    const finalCollections = await getCollectionCounts();
    const missingDocuments = Object.values(finalCollections).reduce(
      (total, counts) => total + counts.missingTenantId,
      0,
    );
    if (missingDocuments > 0) {
      throw new Error(
        `Tenant backfill incomplete: ${missingDocuments} document(s) have no tenantId.`,
      );
    }

    const finalReferenceViolations = await getReferenceCounts(defaultTenant._id);
    const finalViolationCount = countTotal(finalReferenceViolations);
    if (finalViolationCount > 0) {
      throw new Error(
        `Tenant backfill verification failed: ${finalViolationCount} cross-tenant reference(s) found.`,
      );
    }

    printCounts({
      collections: finalCollections,
      crossTenantReferences: finalReferenceViolations,
    });
    return {
      collections: finalCollections,
      crossTenantReferences: finalReferenceViolations,
    };
  });

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  const unknownArguments = args.filter((argument) => argument !== "--dry-run");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  }

  await connectDB();
  try {
    await backfillTenant({ dryRun: args.includes("--dry-run") });
  } finally {
    await mongoose.disconnect();
  }
}
