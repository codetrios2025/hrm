import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import cron from "node-cron";

const TEST_SECRET = "tenant-jobs-proman-tests-only";
process.env.JWT_SECRET = TEST_SECRET;
process.env.JWT_EXPIRES_IN = "1h";
process.env.HRM_PROMAN_BASE_URL = "https://default.example/api/tasks";
process.env.HRM_PROMAN_SECRET = "default-only-secret";

const [
  { default: app },
  { User },
  { Attendance },
  { default: Tenant },
  { initAttendanceCron },
  { initLeaveRolloverCron },
  { getTenantId },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/User.js"),
  import("../src/models/Attendance.js"),
  import("../src/models/Tenant.js"),
  import("../src/jobs/attendance.cron.js"),
  import("../src/jobs/leaveRollover.cron.js"),
  import("../src/utils/tenantContext.js"),
]);

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;

after(
  () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

const queryFor = (value) => ({
  select() {
    return this;
  },
  where() {
    return this;
  },
  lean() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const requestAs = (url, userId, tenantId, options = {}) =>
  fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${jwt.sign(
        { id: String(userId), role: "employee", tenantId: String(tenantId) },
        TEST_SECRET,
      )}`,
      ...options.headers,
    },
  });

test("auto-punchout processes active tenants inside tenant context", async (t) => {
  const tenants = [
    { _id: new mongoose.Types.ObjectId() },
    { _id: new mongoose.Types.ObjectId() },
  ];
  t.mock.method(Tenant, "find", (filter) => {
    assert.deepEqual(filter, { status: "active" });
    return queryFor(tenants);
  });

  const scheduled = [];
  t.mock.method(cron, "schedule", (expression, callback) => {
    scheduled.push({ expression, callback });
    return { stop() {} };
  });

  const seenQueries = [];
  t.mock.method(Attendance, "find", async (filter) => {
    seenQueries.push({ filter, contextTenantId: getTenantId() });
    return [];
  });
  t.mock.method(console, "log", () => {});

  initAttendanceCron();
  assert.equal(scheduled.length, 1);
  await scheduled[0].callback();

  assert.equal(seenQueries.length, tenants.length);
  for (let index = 0; index < tenants.length; index++) {
    assert.equal(
      String(seenQueries[index].filter.tenantId),
      String(tenants[index]._id),
    );
    assert.equal(
      String(seenQueries[index].contextTenantId),
      String(tenants[index]._id),
    );
    assert.equal(seenQueries[index].filter.status, "in-progress");
  }
});

test("year-end rollover processes active tenants inside tenant context", async (t) => {
  const tenants = [
    { _id: new mongoose.Types.ObjectId() },
    { _id: new mongoose.Types.ObjectId() },
  ];
  t.mock.method(Tenant, "find", (filter) => {
    assert.deepEqual(filter, { status: "active" });
    return queryFor(tenants);
  });

  const scheduled = [];
  t.mock.method(cron, "schedule", (expression, callback, options) => {
    scheduled.push({ expression, callback, options });
    return { stop() {} };
  });

  const seenQueries = [];
  t.mock.method(User, "find", async (filter) => {
    seenQueries.push({ filter, contextTenantId: getTenantId() });
    return [];
  });
  t.mock.method(console, "log", () => {});

  initLeaveRolloverCron();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].options.timezone, "Asia/Kolkata");
  await scheduled[0].callback();

  assert.equal(seenQueries.length, tenants.length);
  for (let index = 0; index < tenants.length; index++) {
    assert.equal(
      String(seenQueries[index].filter.tenantId),
      String(tenants[index]._id),
    );
    assert.equal(
      String(seenQueries[index].contextTenantId),
      String(tenants[index]._id),
    );
    assert.equal(seenQueries[index].filter.isActive, true);
  }
});

test("Proman requests use tenant settings and default-only environment fallbacks", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const defaultTenantId = new mongoose.Types.ObjectId();
  const unconfiguredTenantId = new mongoose.Types.ObjectId();
  const userIds = new Map([
    ["user-a", tenantA],
    ["user-b", tenantB],
    ["default-user", defaultTenantId],
    ["unconfigured-user", unconfiguredTenantId],
  ]);
  t.mock.method(User, "findById", (id) =>
    queryFor({
      _id: id,
      tenantId: userIds.get(String(id)),
      role: "employee",
      isActive: true,
    }),
  );
  const tenantConfigs = new Map([
    [
      String(tenantA),
      {
        _id: tenantA,
        slug: "company-a",
        status: "active",
        plan: "pro",
        billing: { status: "active" },
        proman: {
          baseUrl: "https://a.example/api/tasks",
          secret: "tenant-a-secret",
        },
      },
    ],
    [
      String(tenantB),
      {
        _id: tenantB,
        slug: "company-b",
        status: "active",
        plan: "pro",
        billing: { status: "active" },
        proman: {
          baseUrl: "https://b.example/api/tasks/",
          secret: "tenant-b-secret",
        },
      },
    ],
    [
      String(defaultTenantId),
      {
        _id: defaultTenantId,
        slug: "default",
        status: "active",
        plan: "pro",
        billing: { status: "active" },
        proman: {},
      },
    ],
    [
      String(unconfiguredTenantId),
      {
        _id: unconfiguredTenantId,
        slug: "company-c",
        status: "active",
        plan: "pro",
        billing: { status: "active" },
        proman: {},
      },
    ],
  ]);
  const tenantLookups = [];
  t.mock.method(Tenant, "findById", (id) => {
    tenantLookups.push(id);
    return queryFor(tenantConfigs.get(String(id)) || null);
  });

  const outboundRequests = [];
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(baseUrl)) {
      return nativeFetch(url, options);
    }
    outboundRequests.push({ url, options });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.equal(
    (await requestAs("/api/proman/tasks?email=a%40example.com", "user-a", tenantA))
      .status,
    200,
  );
  assert.equal(
    (await requestAs("/api/proman/timelog", "user-b", tenantB, {
      method: "POST",
      body: JSON.stringify({ taskId: "task-b" }),
    })).status,
    200,
  );
  assert.equal(
    (await requestAs("/api/proman/task/task-a/status", "user-a", tenantA, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    })).status,
    200,
  );
  assert.equal(
    (await requestAs("/api/proman/tasks", "default-user", defaultTenantId))
      .status,
    200,
  );
  const unconfigured = await requestAs(
    "/api/proman/tasks",
    "unconfigured-user",
    unconfiguredTenantId,
  );

  assert.equal(unconfigured.status, 503);
  assert.equal(outboundRequests.length, 4);
  assert.equal(outboundRequests[0].url, "https://a.example/api/tasks/external/tasks?email=a%40example.com");
  assert.equal(outboundRequests[0].options.headers["x-hrm-key"], "tenant-a-secret");
  assert.equal(outboundRequests[1].url, "https://b.example/api/tasks/external/timelog");
  assert.equal(outboundRequests[1].options.headers["x-hrm-key"], "tenant-b-secret");
  assert.equal(outboundRequests[2].url, "https://a.example/api/tasks/external/task/task-a/status");
  assert.equal(outboundRequests[2].options.headers["x-hrm-key"], "tenant-a-secret");
  assert.equal(outboundRequests[3].url, "https://default.example/api/tasks/external/tasks?email=");
  assert.equal(outboundRequests[3].options.headers["x-hrm-key"], "default-only-secret");
  assert.equal(tenantLookups.length, 10);
});
