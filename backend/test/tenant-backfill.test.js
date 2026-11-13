import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { backfillTenant } from "../scripts/migrations/001-backfill-tenant.js";
import { Attendance } from "../src/models/Attendance.js";
import Holiday from "../src/models/Holiday.js";
import { Leave } from "../src/models/Leave.js";
import { OutdoorDuty } from "../src/models/OutdoorDuty.js";
import Tenant from "../src/models/Tenant.js";
import { User } from "../src/models/User.js";

const collections = [
  User,
  Attendance,
  Leave,
  OutdoorDuty,
  Holiday,
];

test("tenantId is required, indexed, immutable, and references Tenant", () => {
  for (const model of collections) {
    const tenantId = model.schema.path("tenantId");
    assert.equal(tenantId.instance, "ObjectId");
    assert.equal(tenantId.options.ref, "Tenant");
    assert.equal(tenantId.options.index, true);
    assert.equal(tenantId.isRequired, true);
    assert.equal(tenantId.options.immutable, true);
  }
});

const isMissingTenantFilter = (filter) => Array.isArray(filter.$or);

const mockDatabase = (t, { crossTenantReference } = {}) => {
  const missingCounts = new Map(collections.map((model) => [model, 2]));
  const updateCalls = [];
  const tenantId = new mongoose.Types.ObjectId();

  t.mock.method(Tenant, "findOne", async () => ({ _id: tenantId }));

  for (const model of collections) {
    t.mock.method(model, "countDocuments", async (filter) =>
      isMissingTenantFilter(filter) ? missingCounts.get(model) : 2,
    );
    t.mock.method(model, "aggregate", async (pipeline) => {
      const field = Object.keys(pipeline[0].$match)[0];
      return crossTenantReference === `${model.modelName}.${field}`
        ? [{ count: 1 }]
        : [];
    });
    t.mock.method(model, "updateMany", async (filter, update, options) => {
      updateCalls.push({ model, filter, update, options });
      const modifiedCount = missingCounts.get(model);
      missingCounts.set(model, 0);
      return { modifiedCount };
    });
  }

  t.mock.method(console, "log", () => {});

  return { missingCounts, tenantId, updateCalls };
};

test("tenant backfill dry-run reports counts without writing", async (t) => {
  const { updateCalls } = mockDatabase(t);

  const summary = await backfillTenant({ dryRun: true });

  assert.equal(Object.keys(summary.collections).length, collections.length);
  assert.equal(summary.collections.users.total, 2);
  assert.equal(summary.collections.users.missingTenantId, 2);
  assert.equal(updateCalls.length, 0);
});

test("tenant backfill only updates missing tenantIds and is repeatable", async (t) => {
  const { missingCounts, tenantId, updateCalls } = mockDatabase(t);

  await backfillTenant();
  await backfillTenant();

  assert.equal(updateCalls.length, collections.length * 2);
  for (const { filter, update, options } of updateCalls) {
    assert.ok(isMissingTenantFilter(filter));
    assert.deepEqual(update, { $set: { tenantId } });
    assert.deepEqual(options, { overwriteImmutable: true });
  }
  assert.ok([...missingCounts.values()].every((count) => count === 0));
});

test("tenant backfill aborts before writing when cross-tenant references exist", async (t) => {
  const { updateCalls } = mockDatabase(t, {
    crossTenantReference: "Leave.reviewedBy",
  });

  await assert.rejects(
    backfillTenant(),
    /1 cross-tenant reference\(s\) found/,
  );
  assert.equal(updateCalls.length, 0);
});
