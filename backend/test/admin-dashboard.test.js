import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const JWT_SECRET = "admin-dashboard-test-secret";
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_EXPIRES_IN = "1h";

const [{ default: app }, { default: Tenant }, { User }, { Attendance }, { Leave }, { OutdoorDuty }, { default: Holiday }] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/models/Tenant.js"),
    import("../src/models/User.js"),
    import("../src/models/Attendance.js"),
    import("../src/models/Leave.js"),
    import("../src/models/OutdoorDuty.js"),
    import("../src/models/Holiday.js"),
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

const tenantA = new mongoose.Types.ObjectId();
const tenantBEmployee = new mongoose.Types.ObjectId();
const adminUserId = new mongoose.Types.ObjectId();
const employeeA1 = new mongoose.Types.ObjectId();
const employeeA2 = new mongoose.Types.ObjectId();
const queryFor = (value) => ({
  where() {
    return this;
  },
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

const request = (token, url = "/api/admin/dashboard") =>
  fetch(`${baseUrl}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

const tokenFor = (role) =>
  jwt.sign(
    {
      id: adminUserId.toString(),
      role,
      tenantId: tenantA.toString(),
    },
    JWT_SECRET,
  );

test("admin dashboard aggregates and reports only the authenticated tenant", async (t) => {
  const tenant = {
    _id: tenantA,
    status: "active",
    plan: "free",
    employeeLimitOverride: null,
    trialEndsAt: null,
    billing: { status: "inactive" },
  };
  const currentUser = {
    _id: adminUserId,
    tenantId: tenantA,
    role: "admin",
    isActive: true,
  };
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  t.mock.method(User, "findById", () => queryFor(currentUser));

  const aggregateCalls = [];
  t.mock.method(User, "aggregate", async (pipeline) => {
    aggregateCalls.push({ model: "users", pipeline });
    return [
      {
        summary: [
          { totalEmployees: 2, activeEmployees: 2, inactiveEmployees: 0 },
        ],
        activeUsers: [{ userIds: [employeeA1, employeeA2] }],
        departments: [{ _id: "Engineering", count: 2 }],
        joinersThisMonth: [{ count: 1 }],
        onProbation: [{ count: 2 }],
      },
    ];
  });
  t.mock.method(Attendance, "aggregate", async (pipeline) => {
    aggregateCalls.push({ model: "attendance", pipeline });
    return [
      {
        today: [
          { _id: "present", userIds: [employeeA1] },
          { _id: "absent", userIds: [employeeA2] },
        ],
        trend: [
          {
            _id: {
              date: new Date().toISOString().slice(0, 10),
              status: "present",
            },
            count: 1,
          },
        ],
      },
    ];
  });
  t.mock.method(Leave, "aggregate", async (pipeline) => {
    aggregateCalls.push({ model: "leave", pipeline });
    const match = pipeline[0].$match;
    if (match.status === "pending") {
      return [{ count: [{ count: 2 }], items: [] }];
    }
    if (match.updatedAt) return [{ count: 1 }];
    return [{ userIds: [] }];
  });
  t.mock.method(OutdoorDuty, "aggregate", async (pipeline) => {
    aggregateCalls.push({ model: "outdoor-duty", pipeline });
    return pipeline[0].$match.status === "pending"
      ? [{ count: [{ count: 1 }], items: [] }]
      : [];
  });
  t.mock.method(Holiday, "aggregate", async (pipeline) => {
    aggregateCalls.push({ model: "holiday", pipeline });
    return [];
  });

  const response = await request(tokenFor("admin"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.totalEmployees, 2);
  assert.deepEqual(body.data.today, {
    present: 1,
    absent: 1,
    onLeave: 0,
    onOutdoorDuty: 0,
    notPunchedInYet: 0,
  });
  assert.equal(body.data.pendingApprovals.leaveRequests.count, 2);
  assert.equal(body.data.pendingApprovals.outdoorDutyRequests.count, 1);
  assert.equal(body.data.planInfo.employeesUsed, 2);
  assert.equal(aggregateCalls.length, 8);
  for (const { pipeline } of aggregateCalls) {
    assert.equal(String(pipeline[0].$match.tenantId), tenantA.toString());
    assert.ok(
      !(pipeline[0].$match.userId?.$in || []).some(
        (id) => String(id) === tenantBEmployee.toString(),
      ),
    );
  }
  const leaveLookup = aggregateCalls
    .find(
      ({ model, pipeline }) =>
        model === "leave" && pipeline[0].$match.status === "pending",
    )
    .pipeline[1].$facet.items.find((stage) => stage.$lookup).$lookup.pipeline[0]
      .$match.$expr.$and;
  assert.ok(
    leaveLookup.some(
      (condition) => String(condition.$eq?.[1]) === tenantA.toString(),
    ),
  );
});

test("dashboard is unavailable to non-admin tenant users", async (t) => {
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      _id: tenantA,
      status: "active",
      plan: "free",
      billing: { status: "inactive" },
    }),
  );
  t.mock.method(User, "findById", () =>
    queryFor({
      _id: adminUserId,
      tenantId: tenantA,
      role: "employee",
      isActive: true,
    }),
  );
  const userAggregate = t.mock.method(User, "aggregate", async () => {
    throw new Error("employee tokens must not access dashboard aggregates");
  });

  const response = await request(tokenFor("employee"));

  assert.equal(response.status, 403);
  assert.equal(userAggregate.mock.callCount(), 0);
});
