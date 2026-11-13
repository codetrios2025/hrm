import assert from "node:assert/strict";
import { test } from "node:test";
import Tenant from "../src/models/Tenant.js";
import {
  getTenantContext,
  getTenantId,
  runWithTenant,
} from "../src/utils/tenantContext.js";
import { seedDefaultTenant } from "../scripts/seedDefaultTenant.js";

test("Tenant schema validates required fields, enums, slug, and defaults", async () => {
  const tenant = new Tenant({
    name: "  Example Inc. ",
    slug: "EXAMPLE",
    employeeLimitOverride: 25,
  });

  await tenant.validate();
  assert.equal(tenant.name, "Example Inc.");
  assert.equal(tenant.slug, "example");
  assert.equal(tenant.status, "active");
  assert.equal(tenant.plan, "free");
  assert.equal(tenant.trialEndsAt, null);
  assert.equal(tenant.deletedAt, null);
  assert.equal(tenant.purgeAfter, null);
  assert.equal(tenant.employeeLimitOverride, 25);
  assert.equal(tenant.onboarding.completed, true);
  assert.equal(tenant.onboarding.step, 5);
  assert.equal(tenant.billing.status, "inactive");
  assert.equal(Tenant.schema.path("employeeLimit"), undefined);
  assert.equal(tenant.proman.baseUrl, null);
  assert.equal(tenant.proman.secret, null);
  assert.equal(Tenant.schema.path("proman.secret").options.select, false);
  assert.equal(Tenant.schema.path("slug").options.unique, true);
  assert.equal(Tenant.schema.path("slug").options.immutable, true);

  const invalidTenant = new Tenant({
    name: "Invalid",
    slug: "invalid",
    status: "paused",
    plan: "enterprise",
    employeeLimitOverride: 0,
  });
  await assert.rejects(invalidTenant.validate(), (error) => {
    assert.ok(error.errors.status);
    assert.ok(error.errors.plan);
    assert.ok(error.errors.employeeLimitOverride);
    return true;
  });

  const configuredTenant = new Tenant({
    name: "Configured",
    slug: "configured",
    employeeLimitOverride: 5,
    proman: {
      baseUrl: " https://proman.example/api/tasks/ ",
      secret: "tenant-secret",
    },
  });
  await configuredTenant.validate();
  assert.equal(
    configuredTenant.proman.baseUrl,
    "https://proman.example/api/tasks/",
  );
  assert.equal(configuredTenant.proman.secret, "tenant-secret");
});

test("tenant context remains isolated across asynchronous work", async () => {
  assert.equal(getTenantId(), undefined);
  assert.equal(getTenantContext(), undefined);

  const tenantIds = await Promise.all(
    ["tenant-a", "tenant-b"].map((tenantId) =>
      runWithTenant(tenantId, async () => {
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(getTenantContext(), { tenantId });
        return getTenantId();
      }),
    ),
  );

  assert.deepEqual(tenantIds, ["tenant-a", "tenant-b"]);
  assert.equal(getTenantId(), undefined);
  assert.throws(() => runWithTenant(null, () => {}), /tenantId is required/);
});

test("default tenant seed keeps the workspace active across upserts", async (t) => {
  t.mock.method(Tenant, "init", async () => Tenant);
  const upsert = t.mock.method(
    Tenant,
    "findOneAndUpdate",
    async () => ({ _id: "default-tenant-id" }),
  );

  await seedDefaultTenant();
  await seedDefaultTenant();

  assert.equal(upsert.mock.callCount(), 2);
  for (const call of upsert.mock.calls) {
    assert.deepEqual(call.arguments[0], { slug: "default" });
    assert.deepEqual(call.arguments[1].$set, {
      status: "active",
      trialEndsAt: null,
    });
    assert.deepEqual(call.arguments[1].$setOnInsert, {
      name: "Default",
      plan: "free",
      employeeLimitOverride: null,
    });
    assert.equal(call.arguments[2].upsert, true);
    assert.equal(call.arguments[2].setDefaultsOnInsert, true);
  }
});
