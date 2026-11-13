import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { ENV } from "../../src/config/env.js";
import { User } from "../../src/models/User.js";
import { runWithTenantQueryBypass } from "../../src/plugins/tenantQueryGuard.js";

const globalIndexes = [
  { field: "email", key: { email: 1 } },
  { field: "employeeId", key: { employeeId: 1 } },
];

const tenantIndexes = [
  { field: "email", key: { tenantId: 1, email: 1 } },
  { field: "employeeId", key: { tenantId: 1, employeeId: 1 } },
];

const hasIndexKey = (index, key) =>
  JSON.stringify(index.key) === JSON.stringify(key);

const getIndexes = async () => {
  try {
    return await User.collection.indexes();
  } catch (error) {
    if (error.code === 26) return [];
    throw error;
  }
};

const getDuplicateGroups = async (field) => {
  const groups = await User.aggregate([
    {
      $group: {
        _id: {
          tenantId: "$tenantId",
          [field]: `$${field}`,
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return groups.map(({ _id, count }) => ({
    tenantId: _id.tenantId?.toString() ?? null,
    [field]: _id[field] ?? null,
    count,
  }));
};

const getReport = async (indexes) => {
  const [missingTenantId, duplicateEmails, duplicateEmployeeIds] =
    await Promise.all([
      User.countDocuments({
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
      }),
      getDuplicateGroups("email"),
      getDuplicateGroups("employeeId"),
    ]);

  return {
    totalUsers: await User.countDocuments({}),
    missingTenantId,
    duplicateEmails,
    duplicateEmployeeIds,
    globalUniqueEmailIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, { email: 1 }),
    ).length,
    globalUniqueEmployeeIdIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, { employeeId: 1 }),
    ).length,
    tenantUniqueEmailIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, { tenantId: 1, email: 1 }),
    ).length,
    tenantUniqueEmployeeIdIndexes: indexes.filter(
      (index) =>
        index.unique &&
        hasIndexKey(index, { tenantId: 1, employeeId: 1 }),
    ).length,
  };
};

const printReport = (report) => {
  console.log(JSON.stringify(report, null, 2));
};

export const migrateUserUniqueIndexes = async ({ dryRun = false } = {}) =>
  runWithTenantQueryBypass("migration", async () => {
  const indexes = await getIndexes();
  const report = await getReport(indexes);

  if (dryRun) {
    printReport(report);
    return report;
  }

  const duplicateCount =
    report.duplicateEmails.length + report.duplicateEmployeeIds.length;
  if (report.missingTenantId > 0) {
    printReport(report);
    throw new Error(
      `User index migration aborted: ${report.missingTenantId} user(s) have no tenantId. Run migration 001 first.`,
    );
  }
  if (duplicateCount > 0) {
    printReport(report);
    throw new Error(
      `User index migration aborted: ${duplicateCount} duplicate tenant/email or tenant/employeeId group(s) must be resolved first.`,
    );
  }

  for (const index of indexes) {
    for (const { key } of globalIndexes) {
      if (index.unique && hasIndexKey(index, key)) {
        await User.collection.dropIndex(index.name);
      }
    }

    for (const { key } of tenantIndexes) {
      if (hasIndexKey(index, key) && !index.unique) {
        await User.collection.dropIndex(index.name);
      }
    }
  }

  for (const { key } of tenantIndexes) {
    await User.collection.createIndex(key, { unique: true });
  }

  const finalReport = await getReport(await getIndexes());
  if (
    finalReport.globalUniqueEmailIndexes !== 0 ||
    finalReport.globalUniqueEmployeeIdIndexes !== 0 ||
    finalReport.tenantUniqueEmailIndexes !== 1 ||
    finalReport.tenantUniqueEmployeeIdIndexes !== 1
  ) {
    throw new Error("User index migration verification failed.");
  }

  printReport(finalReport);
  return finalReport;
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

  try {
    await mongoose.connect(ENV.MONGO_URI, { autoIndex: false });
    await migrateUserUniqueIndexes({ dryRun: args.includes("--dry-run") });
  } finally {
    await mongoose.disconnect();
  }
}
