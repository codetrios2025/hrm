import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { test } from "node:test";
import { PLANS, planHasFeature } from "../src/config/plans.js";
import { checkPlanLimit, requirePlanFeature } from "../src/middlewares/checkPlanLimit.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import Tenant from "../src/models/Tenant.js";
import { User } from "../src/models/User.js";

const queryFor = (value) => ({
  select() {
    return this;
  },
  lean: async () => value,
});

const requestWithMiddleware = async (t, tenant, middleware, options = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
    }
    next();
  });
  app.all("/", middleware, (req, res) => res.json({ success: true }));
  app.use(errorHandler);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return fetch(`http://127.0.0.1:${server.address().port}/`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
};

test("plan caps and premium modules are defined centrally", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PLANS).map(([id, plan]) => [id, plan.employeeLimit]),
    ),
    { free: 10, basic: 50, pro: 200 },
  );
  assert.equal(planHasFeature("free", "exports"), false);
  assert.equal(planHasFeature("basic", "taskTimeTracker"), false);
  assert.equal(planHasFeature("pro", "exports"), true);
  assert.equal(planHasFeature("pro", "taskTimeTracker"), true);
});

test("employee creation middleware blocks capacity overflow with a code", async (t) => {
  t.mock.method(Tenant, "findById", () =>
    queryFor({ plan: "free", employeeLimitOverride: null }),
  );
  t.mock.method(User, "countDocuments", async () => 10);

  const response = await requestWithMiddleware(
    t,
    { _id: "tenant-a", status: "active", plan: "free" },
    checkPlanLimit({ employeeDelta: 1 }),
    { method: "POST", body: {} },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "PLAN_LIMIT_REACHED");
});

test("a new signup trial can write before its end date", async (t) => {
  const tenant = {
    _id: "tenant-trial",
    status: "trial",
    plan: "free",
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  };
  const writeResponse = await requestWithMiddleware(
    t,
    tenant,
    checkPlanLimit(),
    { method: "POST", body: {} },
  );

  assert.equal(writeResponse.status, 200);
});

test("a trial without trialEndsAt can write", async (t) => {
  const tenant = {
    _id: "tenant-trial-no-end",
    status: "trial",
    plan: "basic",
    trialEndsAt: null,
    billing: { status: "inactive" },
  };
  const updateTrial = t.mock.method(Tenant, "findOneAndUpdate", async () => {
    throw new Error("trial without an end date must not be expired");
  });

  const response = await requestWithMiddleware(
    t,
    tenant,
    checkPlanLimit(),
    { method: "POST", body: {} },
  );

  assert.equal(response.status, 200);
  assert.equal(updateTrial.mock.callCount(), 0);
});

test("an expired trial is downgraded to active free before writes", async (t) => {
  const expiredAt = new Date(Date.now() - 1000);
  const tenant = {
    _id: "tenant-expired-trial",
    status: "trial",
    plan: "pro",
    employeeLimitOverride: 100,
    trialEndsAt: expiredAt,
    billing: { status: "active" },
  };
  const updatedTenant = {
    _id: tenant._id,
    status: "active",
    plan: "free",
    employeeLimitOverride: null,
    trialEndsAt: null,
    billing: { status: "active" },
  };
  const downgrade = t.mock.method(Tenant, "findOneAndUpdate", () =>
    queryFor(updatedTenant),
  );

  const response = await requestWithMiddleware(
    t,
    tenant,
    checkPlanLimit(),
    { method: "POST", body: {} },
  );

  assert.equal(response.status, 200);
  assert.equal(downgrade.mock.callCount(), 1);
  const filter = downgrade.mock.calls[0].arguments[0];
  assert.equal(filter._id, tenant._id);
  assert.equal(filter.status, "trial");
  assert.ok(filter.trialEndsAt.$lte instanceof Date);
  assert.deepEqual(downgrade.mock.calls[0].arguments[1].$set, {
    status: "active",
    plan: "free",
    employeeLimitOverride: null,
    trialEndsAt: null,
  });
  assert.ok(filter.trialEndsAt.$lte >= expiredAt);
});

test("unpaid subscriptions remain readable but cannot write", async (t) => {
  const tenant = {
    _id: "tenant-unpaid",
    status: "active",
    plan: "basic",
    billing: { status: "halted" },
  };
  const readResponse = await requestWithMiddleware(
    t,
    tenant,
    checkPlanLimit(),
  );
  const writeResponse = await requestWithMiddleware(
    t,
    tenant,
    checkPlanLimit(),
    { method: "PATCH", body: {} },
  );

  assert.equal(readResponse.status, 200);
  assert.equal(writeResponse.status, 403);
  assert.equal((await writeResponse.json()).code, "SUBSCRIPTION_EXPIRED");
});

test("suspended tenants cannot write, including free non-payment suspensions", async (t) => {
  const tenant = {
    _id: "tenant-suspended",
    status: "suspended",
    plan: "free",
    billing: { status: "suspended", suspensionReason: "non-payment" },
  };
  const response = await requestWithMiddleware(
    t,
    tenant,
    checkPlanLimit(),
    { method: "POST", body: {} },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "SUBSCRIPTION_EXPIRED");
});

test("features outside a plan are denied with a code", async (t) => {
  const tenant = { _id: "tenant-free", status: "active", plan: "free" };
  for (const feature of ["taskTimeTracker", "exports"]) {
    const response = await requestWithMiddleware(
      t,
      tenant,
      requirePlanFeature(feature),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "FEATURE_NOT_IN_PLAN");
  }
});

test("company-code registration checks the employee seat limit", async (t) => {
  t.mock.method(Tenant, "findOne", async () => ({
    _id: "tenant-free",
    status: "active",
    plan: "free",
    billing: { status: "inactive" },
  }));
  t.mock.method(Tenant, "findById", () =>
    queryFor({ plan: "free", employeeLimitOverride: null }),
  );
  t.mock.method(User, "countDocuments", async () => 10);

  const response = await requestWithMiddleware(
    t,
    null,
    checkPlanLimit({ resolveByCompanySlug: true, employeeDelta: 1 }),
    {
      method: "POST",
      body: { companySlug: "sample" },
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "PLAN_LIMIT_REACHED");
});
