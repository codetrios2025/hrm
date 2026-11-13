import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";
import { connectDB } from "../../src/config/db.js";
import { Leave } from "../../src/models/Leave.js";
import Tenant from "../../src/models/Tenant.js";
import { User } from "../../src/models/User.js";
import { runWithTenantQueryBypass } from "../../src/plugins/tenantQueryGuard.js";

const defaultUploadsRoot = path.resolve(
  fileURLToPath(new URL("../../uploads", import.meta.url)),
);
const categories = ["documents", "prescriptions"];
const fileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const fileExists = async (filePath) => {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};

const selectRecords = async (model, filter, selection) =>
  model.find(filter).select(selection).lean();

const createReport = () => ({
  defaultTenantId: null,
  documents: {
    records: 0,
    filesToMove: 0,
    alreadyMigrated: 0,
    missingFiles: 0,
    invalidFileNames: 0,
    tenantMismatches: 0,
    destinationConflicts: 0,
    missingTenantIds: 0,
  },
  prescriptions: {
    records: 0,
    filesToMove: 0,
    alreadyMigrated: 0,
    missingFiles: 0,
    invalidFileNames: 0,
    tenantMismatches: 0,
    destinationConflicts: 0,
    missingTenantIds: 0,
  },
});

const scanRecords = async ({
  records,
  category,
  defaultTenantId,
  uploadsRoot,
  report,
}) => {
  const plans = [];
  const tenantKey = String(defaultTenantId);
  const categoryReport = report[category];

  for (const record of records) {
    const files =
      category === "documents"
        ? record.documents || []
        : record.prescription?.fileName
          ? [record.prescription]
          : [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (!file.fileName) continue;

      categoryReport.records++;
      if (!String(record.tenantId || "")) {
        categoryReport.missingTenantIds++;
        continue;
      }
      if (!fileNamePattern.test(file.fileName)) {
        categoryReport.invalidFileNames++;
        continue;
      }

      const recordTenantId = String(record.tenantId);
      const storedPath = `/uploads/${recordTenantId}/${category}/${file.fileName}`;
      const destinationPath = path.join(
        uploadsRoot,
        recordTenantId,
        category,
        file.fileName,
      );
      const destinationExists = await fileExists(destinationPath);

      if (file.path === storedPath) {
        if (destinationExists) {
          categoryReport.alreadyMigrated++;
        } else {
          categoryReport.missingFiles++;
        }
        continue;
      }

      if (recordTenantId !== tenantKey) {
        categoryReport.tenantMismatches++;
        continue;
      }

      const sourcePath = path.join(uploadsRoot, category, file.fileName);
      const sourceExists = await fileExists(sourcePath);

      if (sourceExists && destinationExists) {
        categoryReport.destinationConflicts++;
        continue;
      }
      if (!sourceExists && !destinationExists) {
        categoryReport.missingFiles++;
        continue;
      }

      if (sourceExists) categoryReport.filesToMove++;
      else categoryReport.alreadyMigrated++;

      plans.push({
        record,
        index,
        category,
        fileName: file.fileName,
        sourcePath: sourceExists ? sourcePath : null,
        destinationPath,
        storedPath,
      });
    }
  }

  return plans;
};

const hasPreflightErrors = (report) =>
  categories.some((categoryName) =>
    [
      "missingFiles",
      "invalidFileNames",
      "tenantMismatches",
      "destinationConflicts",
      "missingTenantIds",
    ].some((key) => report[categoryName][key] > 0),
  );

const buildMigrationPlan = async (uploadsRoot) => {
  const defaultTenant = await Tenant.findOne({ slug: "default" })
    .select("_id")
    .lean();
  if (!defaultTenant) {
    throw new Error(
      "Default tenant not found. Run scripts/seedDefaultTenant.js first.",
    );
  }

  const [users, leaves] = await Promise.all([
    selectRecords(
      User,
      { "documents.0": { $exists: true } },
      "_id tenantId documents",
    ),
    selectRecords(
      Leave,
      { "prescription.fileName": { $exists: true, $ne: null } },
      "_id tenantId prescription",
    ),
  ]);
  const report = createReport();
  report.defaultTenantId = String(defaultTenant._id);

  const [documentPlans, prescriptionPlans] = await Promise.all([
    scanRecords({
      records: users,
      category: "documents",
      defaultTenantId: defaultTenant._id,
      uploadsRoot,
      report,
    }),
    scanRecords({
      records: leaves,
      category: "prescriptions",
      defaultTenantId: defaultTenant._id,
      uploadsRoot,
      report,
    }),
  ]);

  return {
    defaultTenant,
    users,
    leaves,
    report,
    plans: [...documentPlans, ...prescriptionPlans],
  };
};

const buildBulkUpdates = (plans, category) => {
  const updates = new Map();
  for (const plan of plans.filter((item) => item.category === category)) {
    const recordId = String(plan.record._id);
    const existing = updates.get(recordId) || {
      _id: plan.record._id,
      tenantId: plan.record.tenantId,
      set: {},
    };
    const field =
      category === "documents"
        ? `documents.${plan.index}.path`
        : "prescription.path";
    existing.set[field] = plan.storedPath;
    updates.set(recordId, existing);
  }

  return [...updates.values()].map(({ _id, tenantId, set }) => ({
    updateOne: {
      filter: { _id, tenantId },
      update: { $set: set },
    },
  }));
};

const printReport = (report) => {
  console.log(JSON.stringify(report, null, 2));
};

export const migrateTenantUploadPaths = async ({
  dryRun = false,
  uploadsRoot = defaultUploadsRoot,
} = {}) =>
  runWithTenantQueryBypass("migration", async () => {
  const plan = await buildMigrationPlan(uploadsRoot);
  if (dryRun) {
    printReport(plan.report);
    return plan.report;
  }

  if (hasPreflightErrors(plan.report)) {
    printReport(plan.report);
    throw new Error(
      "Upload path migration aborted. Resolve missing files, invalid names, tenant mismatches, and missing tenant IDs before retrying.",
    );
  }

  for (const item of plan.plans) {
    if (!item.sourcePath) continue;
    await fs.promises.mkdir(path.dirname(item.destinationPath), {
      recursive: true,
    });
    await fs.promises.rename(item.sourcePath, item.destinationPath);
  }

  const documentUpdates = buildBulkUpdates(plan.plans, "documents");
  const prescriptionUpdates = buildBulkUpdates(plan.plans, "prescriptions");
  if (documentUpdates.length > 0) {
    await User.bulkWrite(documentUpdates);
  }
  if (prescriptionUpdates.length > 0) {
    await Leave.bulkWrite(prescriptionUpdates);
  }

  const finalPlan = await buildMigrationPlan(uploadsRoot);
  if (
    finalPlan.report.documents.missingFiles > 0 ||
    finalPlan.report.documents.filesToMove > 0 ||
    finalPlan.report.documents.invalidFileNames > 0 ||
    finalPlan.report.documents.tenantMismatches > 0 ||
    finalPlan.report.documents.destinationConflicts > 0 ||
    finalPlan.report.documents.missingTenantIds > 0 ||
    finalPlan.report.prescriptions.missingFiles > 0 ||
    finalPlan.report.prescriptions.filesToMove > 0 ||
    finalPlan.report.prescriptions.invalidFileNames > 0 ||
    finalPlan.report.prescriptions.tenantMismatches > 0 ||
    finalPlan.report.prescriptions.destinationConflicts > 0 ||
    finalPlan.report.prescriptions.missingTenantIds > 0
  ) {
    printReport(finalPlan.report);
    throw new Error("Upload path migration verification failed.");
  }

  printReport(finalPlan.report);
  return finalPlan.report;
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
    await migrateTenantUploadPaths({ dryRun: args.includes("--dry-run") });
  } finally {
    await mongoose.disconnect();
  }
}
