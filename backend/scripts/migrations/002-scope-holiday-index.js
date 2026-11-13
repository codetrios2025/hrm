import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { ENV } from "../../src/config/env.js";
import Holiday from "../../src/models/Holiday.js";
import { runWithTenantQueryBypass } from "../../src/plugins/tenantQueryGuard.js";

const globalDateKey = { date: 1 };
const tenantDateKey = { tenantId: 1, date: 1 };

const hasIndexKey = (index, key) =>
  JSON.stringify(index.key) === JSON.stringify(key);

const getIndexes = async () => {
  try {
    return await Holiday.collection.indexes();
  } catch (error) {
    if (error.code === 26) return [];
    throw error;
  }
};

const getDuplicateTenantDateGroupCount = async () => {
  const [result] = await Holiday.aggregate([
    {
      $group: {
        _id: { tenantId: "$tenantId", date: "$date" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]);
  return result?.count ?? 0;
};

const getCounts = async (indexes) => {
  const [totalHolidays, missingTenantId, duplicateTenantDateGroups] =
    await Promise.all([
      Holiday.countDocuments({}),
      Holiday.countDocuments({
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
      }),
      getDuplicateTenantDateGroupCount(),
    ]);

  return {
    totalHolidays,
    missingTenantId,
    duplicateTenantDateGroups,
    globalDateUniqueIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, globalDateKey),
    ).length,
    tenantDateUniqueIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, tenantDateKey),
    ).length,
  };
};

const printCounts = (counts) => {
  console.log(JSON.stringify(counts, null, 2));
};

export const migrateHolidayTenantIndex = async ({ dryRun = false } = {}) =>
  runWithTenantQueryBypass("migration", async () => {
  const indexes = await getIndexes();
  const counts = await getCounts(indexes);

  if (dryRun) {
    printCounts(counts);
    return counts;
  }

  if (counts.missingTenantId > 0) {
    throw new Error(
      `Holiday index migration aborted: ${counts.missingTenantId} holiday(s) have no tenantId. Run migration 001 first.`,
    );
  }
  if (counts.duplicateTenantDateGroups > 0) {
    throw new Error(
      `Holiday index migration aborted: ${counts.duplicateTenantDateGroups} duplicate tenant/date group(s) must be resolved first.`,
    );
  }

  for (const index of indexes) {
    if (
      index.unique &&
      hasIndexKey(index, globalDateKey)
    ) {
      await Holiday.collection.dropIndex(index.name);
    }

    if (
      hasIndexKey(index, tenantDateKey) &&
      !index.unique
    ) {
      await Holiday.collection.dropIndex(index.name);
    }
  }

  await Holiday.collection.createIndex(tenantDateKey, { unique: true });

  const finalIndexes = await getIndexes();
  const finalCounts = await getCounts(finalIndexes);
  if (
    finalCounts.globalDateUniqueIndexes !== 0 ||
    finalCounts.tenantDateUniqueIndexes !== 1
  ) {
    throw new Error("Holiday index migration verification failed.");
  }

  printCounts(finalCounts);
  return finalCounts;
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
    await migrateHolidayTenantIndex({ dryRun: args.includes("--dry-run") });
  } finally {
    await mongoose.disconnect();
  }
}
