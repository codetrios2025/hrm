import assert from "node:assert/strict";
import { test } from "node:test";
import { getEffectiveEmployeeLimit, checkPlanLimit } from "../src/utils/tenantLimits.js";
import { PLANS } from "../src/config/plans.js";
import Tenant from "../src/models/Tenant.js";
import { User } from "../src/models/User.js";
import { migrateEmployeeLimitOverrides } from "../scripts/migrations/006-employee-limit-override.js";

test("employee plan limits come from the shared plan configuration", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PLANS).map(([id, plan]) => [id, plan.employeeLimit]),
    ),
    { free: 10, basic: 50, pro: 200 },
  );
  assert.equal(
    getEffectiveEmployeeLimit({ plan: "basic", employeeLimitOverride: 37 }),
    37,
  );
  assert.equal(
    getEffectiveEmployeeLimit({ plan: "pro", employeeLimitOverride: null }),
    PLANS.pro.employeeLimit,
  );
});

test("capacity checks count active non-admin users only", async (t) => {
  const tenantId = "0123456789abcdef01234567";
  t.mock.method(Tenant, "findById", () => ({
    select() {
      return this;
    },
    lean: async () => ({
      plan: "free",
      employeeLimitOverride: null,
    }),
  }));
  const count = t.mock.method(User, "countDocuments", async () => 10);

  await assert.rejects(
    checkPlanLimit(tenantId, 1),
    (error) =>
      error.statusCode === 403 && error.code === "PLAN_LIMIT_REACHED",
  );
  assert.deepEqual(count.mock.calls[0].arguments[0], {
    tenantId,
    role: { $ne: "admin" },
    isActive: { $ne: false },
  });
});

test("legacy employee limits migrate to plan defaults or explicit overrides", async (t) => {
  const docs = [
    { _id: "default-free", plan: "free", employeeLimit: 10 },
    { _id: "custom-basic", plan: "basic", employeeLimit: 23 },
  ];
  let pending = docs;
  const updates = [];
  t.mock.method(Tenant.collection, "find", (filter) => {
    assert.deepEqual(filter, { employeeLimit: { $exists: true } });
    return { toArray: async () => pending };
  });
  const updateOne = t.mock.method(
    Tenant.collection,
    "updateOne",
    async (filter, update) => {
      updates.push({ filter, update });
      pending = pending.filter((doc) => String(doc._id) !== String(filter._id));
    },
  );

  const dryRun = await migrateEmployeeLimitOverrides({ dryRun: true });
  assert.deepEqual(dryRun, {
    tenantsToMigrate: 2,
    planDefaults: 1,
    customOverrides: 1,
    dryRun: true,
  });
  assert.equal(updateOne.mock.callCount(), 0);

  const migrated = await migrateEmployeeLimitOverrides();
  assert.equal(migrated.dryRun, false);
  assert.deepEqual(updates.map(({ update }) => update), [
    {
      $set: { employeeLimitOverride: null },
      $unset: { employeeLimit: "" },
    },
    {
      $set: { employeeLimitOverride: 23 },
      $unset: { employeeLimit: "" },
    },
  ]);
  assert.equal((await migrateEmployeeLimitOverrides()).tenantsToMigrate, 0);
});
