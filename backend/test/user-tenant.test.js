import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { migrateUserUniqueIndexes } from "../scripts/migrations/003-scope-user-unique-indexes.js";
import { User } from "../src/models/User.js";

test("User email and employee ID uniqueness is tenant-scoped", () => {
  assert.notEqual(User.schema.path("email").options.unique, true);
  assert.notEqual(User.schema.path("employeeId").options.unique, true);

  const indexes = User.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.tenantId === 1 && keys.email === 1 && options.unique === true,
    ),
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.tenantId === 1 &&
        keys.employeeId === 1 &&
        options.unique === true,
    ),
  );
});

test("user index migration dry-run reports duplicate keys without writes", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const oldIndexes = [
    { name: "_id_", key: { _id: 1 } },
    { name: "email_1", key: { email: 1 }, unique: true },
    { name: "employeeId_1", key: { employeeId: 1 }, unique: true },
  ];
  const dropIndex = t.mock.method(
    User.collection,
    "dropIndex",
    async () => {},
  );
  const createIndex = t.mock.method(
    User.collection,
    "createIndex",
    async () => "tenantId_1_email_1",
  );
  t.mock.method(User.collection, "indexes", async () => oldIndexes);
  t.mock.method(User, "countDocuments", async (filter) =>
    filter.$or ? 0 : 12,
  );
  t.mock.method(User, "aggregate", async (pipeline) => {
    const key = pipeline[0].$group._id;
    if (key.email) {
      return [
        {
          _id: { tenantId, email: "duplicate@example.com" },
          count: 2,
        },
      ];
    }
    return [];
  });
  t.mock.method(console, "log", () => {});

  const report = await migrateUserUniqueIndexes({ dryRun: true });

  assert.equal(report.totalUsers, 12);
  assert.equal(report.globalUniqueEmailIndexes, 1);
  assert.equal(report.globalUniqueEmployeeIdIndexes, 1);
  assert.deepEqual(report.duplicateEmails, [
    {
      tenantId: tenantId.toString(),
      email: "duplicate@example.com",
      count: 2,
    },
  ]);
  assert.deepEqual(report.duplicateEmployeeIds, []);
  assert.equal(dropIndex.mock.callCount(), 0);
  assert.equal(createIndex.mock.callCount(), 0);
});
