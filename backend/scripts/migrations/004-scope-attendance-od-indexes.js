import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { ENV } from "../../src/config/env.js";
import { Attendance } from "../../src/models/Attendance.js";
import { OutdoorDuty } from "../../src/models/OutdoorDuty.js";
import { runWithTenantQueryBypass } from "../../src/plugins/tenantQueryGuard.js";

const globalKey = { userId: 1, date: 1 };
const tenantKey = { tenantId: 1, userId: 1, date: 1 };

const hasIndexKey = (index, key) =>
  JSON.stringify(index.key) === JSON.stringify(key);

const getIndexes = async (model) => {
  try {
    return await model.collection.indexes();
  } catch (error) {
    if (error.code === 26) return [];
    throw error;
  }
};

const getDuplicateTenantKeyGroupCount = async (model) => {
  const [result] = await model.aggregate([
    {
      $group: {
        _id: {
          tenantId: "$tenantId",
          userId: "$userId",
          date: "$date",
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]);
  return result?.count ?? 0;
};

const getCounts = async (model, indexes) => {
  const [totalDocuments, missingTenantId, duplicateTenantKeyGroups] =
    await Promise.all([
      model.countDocuments({}),
      model.countDocuments({
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
      }),
      getDuplicateTenantKeyGroupCount(model),
    ]);

  return {
    totalDocuments,
    missingTenantId,
    duplicateTenantKeyGroups,
    globalUniqueIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, globalKey),
    ).length,
    tenantUniqueIndexes: indexes.filter(
      (index) => index.unique && hasIndexKey(index, tenantKey),
    ).length,
  };
};

const printReport = (report) => {
  console.log(JSON.stringify(report, null, 2));
};

export const migrateAttendanceAndOutdoorDutyIndexes = async ({
  dryRun = false,
} = {}) =>
  runWithTenantQueryBypass("migration", async () => {
  const models = [
    ["Attendance", Attendance],
    ["OutdoorDuty", OutdoorDuty],
  ];

  const reports = {};
  const indexesByModel = new Map();
  for (const [name, model] of models) {
    const indexes = await getIndexes(model);
    indexesByModel.set(model, indexes);
    reports[name] = await getCounts(model, indexes);
  }

  if (dryRun) {
    printReport(reports);
    return reports;
  }

  for (const [name, report] of Object.entries(reports)) {
    if (report.missingTenantId > 0) {
      printReport(reports);
      throw new Error(
        `${name} index migration aborted: ${report.missingTenantId} document(s) have no tenantId. Run migration 001 first.`,
      );
    }
    if (report.duplicateTenantKeyGroups > 0) {
      printReport(reports);
      throw new Error(
        `${name} index migration aborted: ${report.duplicateTenantKeyGroups} duplicate tenant/user/date group(s) must be resolved first.`,
      );
    }
  }

  for (const [, model] of models) {
    for (const index of indexesByModel.get(model)) {
      if (
        (index.unique && hasIndexKey(index, globalKey)) ||
        (hasIndexKey(index, tenantKey) && !index.unique)
      ) {
        await model.collection.dropIndex(index.name);
      }
    }
    await model.collection.createIndex(tenantKey, { unique: true });
  }

  const finalReports = {};
  for (const [name, model] of models) {
    finalReports[name] = await getCounts(model, await getIndexes(model));
  }

  for (const [name, report] of Object.entries(finalReports)) {
    if (report.globalUniqueIndexes !== 0 || report.tenantUniqueIndexes !== 1) {
      throw new Error(`${name} index migration verification failed.`);
    }
  }

  printReport(finalReports);
  return finalReports;
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
    await migrateAttendanceAndOutdoorDutyIndexes({
      dryRun: args.includes("--dry-run"),
    });
  } finally {
    await mongoose.disconnect();
  }
}
