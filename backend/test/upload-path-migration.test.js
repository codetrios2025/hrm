import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  migrateTenantUploadPaths,
} from "../scripts/migrations/005-tenant-upload-paths.js";
import { Leave } from "../src/models/Leave.js";
import Tenant from "../src/models/Tenant.js";
import { User } from "../src/models/User.js";

const queryFor = (value) => ({
  select() {
    return this;
  },
  lean() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

test("upload path migration moves legacy files and is repeatable", async (t) => {
  const uploadsRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "hrm-upload-migration-"),
  );
  t.after(() => fs.promises.rm(uploadsRoot, { recursive: true, force: true }));

  const tenantId = "0123456789abcdef01234567";
  const document = {
    _id: "user-1",
    tenantId,
    documents: [
      {
        _id: "doc-1",
        fileName: "doc-one.pdf",
        path: "/uploads/documents/doc-one.pdf",
      },
    ],
  };
  const leave = {
    _id: "leave-1",
    tenantId,
    prescription: {
      fileName: "prescription-one.pdf",
      path: path.join(uploadsRoot, "prescriptions", "prescription-one.pdf"),
    },
  };
  const userRecords = [document];
  const leaveRecords = [leave];
  const oldDocumentPath = path.join(uploadsRoot, "documents", "doc-one.pdf");
  const oldPrescriptionPath = path.join(
    uploadsRoot,
    "prescriptions",
    "prescription-one.pdf",
  );
  await fs.promises.mkdir(path.dirname(oldDocumentPath), { recursive: true });
  await fs.promises.mkdir(path.dirname(oldPrescriptionPath), {
    recursive: true,
  });
  await fs.promises.writeFile(oldDocumentPath, "document bytes");
  await fs.promises.writeFile(oldPrescriptionPath, "prescription bytes");

  t.mock.method(Tenant, "findOne", () =>
    queryFor({ _id: tenantId, slug: "default" }),
  );
  t.mock.method(User, "find", () => queryFor(userRecords));
  t.mock.method(Leave, "find", () => queryFor(leaveRecords));
  t.mock.method(User, "bulkWrite", async (operations) => {
    for (const operation of operations) {
      const { filter, update } = operation.updateOne;
      const record = userRecords.find(
        (candidate) =>
          candidate._id === filter._id &&
          candidate.tenantId === filter.tenantId,
      );
      for (const [field, value] of Object.entries(update.$set)) {
        const index = Number(field.split(".")[1]);
        record.documents[index].path = value;
      }
    }
  });
  t.mock.method(Leave, "bulkWrite", async (operations) => {
    for (const operation of operations) {
      const { filter, update } = operation.updateOne;
      const record = leaveRecords.find(
        (candidate) =>
          candidate._id === filter._id &&
          candidate.tenantId === filter.tenantId,
      );
      record.prescription.path = update.$set["prescription.path"];
    }
  });
  t.mock.method(console, "log", () => {});

  const firstRun = await migrateTenantUploadPaths({ uploadsRoot });

  assert.equal(firstRun.documents.filesToMove, 0);
  assert.equal(firstRun.documents.alreadyMigrated, 1);
  assert.equal(firstRun.prescriptions.alreadyMigrated, 1);
  assert.equal(fs.existsSync(oldDocumentPath), false);
  assert.equal(fs.existsSync(oldPrescriptionPath), false);
  assert.equal(
    document.documents[0].path,
    `/uploads/${tenantId}/documents/doc-one.pdf`,
  );
  assert.equal(
    leave.prescription.path,
    `/uploads/${tenantId}/prescriptions/prescription-one.pdf`,
  );
  assert.equal(
    await fs.promises.readFile(
      path.join(uploadsRoot, tenantId, "documents", "doc-one.pdf"),
      "utf8",
    ),
    "document bytes",
  );

  const secondRun = await migrateTenantUploadPaths({ uploadsRoot });
  assert.equal(secondRun.documents.filesToMove, 0);
  assert.equal(secondRun.documents.alreadyMigrated, 1);
  assert.equal(secondRun.prescriptions.alreadyMigrated, 1);
});

test("upload path migration dry-run reports pending moves without changing files", async (t) => {
  const uploadsRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "hrm-upload-dry-run-"),
  );
  t.after(() => fs.promises.rm(uploadsRoot, { recursive: true, force: true }));

  const tenantId = "fedcba987654321001234567";
  const document = {
    _id: "user-dry-run",
    tenantId,
    documents: [
      {
        fileName: "doc-dry.pdf",
        path: "/uploads/documents/doc-dry.pdf",
      },
    ],
  };
  const sourcePath = path.join(uploadsRoot, "documents", "doc-dry.pdf");
  await fs.promises.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.promises.writeFile(sourcePath, "dry run");

  t.mock.method(Tenant, "findOne", () =>
    queryFor({ _id: tenantId, slug: "default" }),
  );
  t.mock.method(User, "find", () => queryFor([document]));
  t.mock.method(Leave, "find", () => queryFor([]));
  const userWrite = t.mock.method(User, "bulkWrite", async () => {});
  const leaveWrite = t.mock.method(Leave, "bulkWrite", async () => {});
  t.mock.method(console, "log", () => {});

  const report = await migrateTenantUploadPaths({
    dryRun: true,
    uploadsRoot,
  });

  assert.equal(report.documents.filesToMove, 1);
  assert.equal(fs.existsSync(sourcePath), true);
  assert.equal(userWrite.mock.callCount(), 0);
  assert.equal(leaveWrite.mock.callCount(), 0);
});
