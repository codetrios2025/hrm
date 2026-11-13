import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const TEST_SECRET = "attendance-leave-od-tenant-tests-only";
process.env.JWT_SECRET = TEST_SECRET;
process.env.JWT_EXPIRES_IN = "1h";

const [
  { default: app },
  { User },
  { Attendance },
  { Leave },
  { OutdoorDuty },
  { default: Tenant },
  { migrateAttendanceAndOutdoorDutyIndexes },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/User.js"),
  import("../src/models/Attendance.js"),
  import("../src/models/Leave.js"),
  import("../src/models/OutdoorDuty.js"),
  import("../src/models/Tenant.js"),
  import("../scripts/migrations/004-scope-attendance-od-indexes.js"),
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

const queryFor = (value, { onPopulate } = {}) => ({
  lean() {
    return this;
  },
  select() {
    return this;
  },
  where() {
    return this;
  },
  populate(argument) {
    onPopulate?.(argument);
    return this;
  },
  sort() {
    return this;
  },
  skip() {
    return this;
  },
  limit() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const requestAs = (url, userId, role, tenantId, options = {}) =>
  fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${jwt.sign(
        { id: String(userId), role, tenantId: String(tenantId) },
        TEST_SECRET,
      )}`,
      ...options.headers,
    },
  });

const stubAuthentication = (t, actor) => {
  let currentActor = actor;
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      _id: currentActor.tenantId,
      status: "active",
      plan: "pro",
      billing: { status: "active" },
    }),
  );
  const mock = t.mock.method(User, "findById", () =>
    queryFor({ ...currentActor, isActive: true }),
  );
  return {
    mock,
    setActor: (nextActor) => {
      currentActor = nextActor;
    },
  };
};

test("Attendance and OutdoorDuty indexes are unique per tenant", () => {
  for (const model of [Attendance, OutdoorDuty]) {
    assert.ok(
      model.schema.indexes().some(
        ([keys, options]) =>
          keys.tenantId === 1 &&
          keys.userId === 1 &&
          keys.date === 1 &&
          options.unique === true,
      ),
    );
    assert.ok(
      !model.schema.indexes().some(
        ([keys, options]) =>
          keys.userId === 1 &&
          keys.date === 1 &&
          Object.keys(keys).length === 2 &&
          options.unique === true,
      ),
    );
  }
});

test("migration 004 dry-run reports both collections without changing indexes", async (t) => {
  const models = [
    { model: Attendance, name: "Attendance" },
    { model: OutdoorDuty, name: "OutdoorDuty" },
  ];
  const indexMethods = [];
  for (const { model } of models) {
    t.mock.method(model.collection, "indexes", async () => [
      { name: "_id_", key: { _id: 1 } },
      {
        name: "userId_1_date_1",
        key: { userId: 1, date: 1 },
        unique: true,
      },
    ]);
    indexMethods.push(
      t.mock.method(model.collection, "dropIndex", async () => {}),
      t.mock.method(model.collection, "createIndex", async () => {}),
    );
    t.mock.method(model, "countDocuments", async (filter) =>
      filter.$or ? 0 : 4,
    );
    t.mock.method(model, "aggregate", async () => []);
  }
  t.mock.method(console, "log", () => {});

  const report = await migrateAttendanceAndOutdoorDutyIndexes({
    dryRun: true,
  });

  assert.equal(report.Attendance.totalDocuments, 4);
  assert.equal(report.Attendance.globalUniqueIndexes, 1);
  assert.equal(report.OutdoorDuty.totalDocuments, 4);
  assert.equal(report.OutdoorDuty.globalUniqueIndexes, 1);
  assert.ok(indexMethods.every((method) => method.mock.callCount() === 0));
});

test("migration 004 replaces global indexes after a clean preflight", async (t) => {
  const methods = [];
  for (const model of [Attendance, OutdoorDuty]) {
    let indexes = [
      { name: "_id_", key: { _id: 1 } },
      {
        name: "userId_1_date_1",
        key: { userId: 1, date: 1 },
        unique: true,
      },
    ];
    t.mock.method(model.collection, "indexes", async () => indexes);
    methods.push(
      t.mock.method(model.collection, "dropIndex", async (name) => {
        indexes = indexes.filter((index) => index.name !== name);
      }),
      t.mock.method(
        model.collection,
        "createIndex",
        async (key, options) => {
          indexes.push({
            name: "tenantId_1_userId_1_date_1",
            key,
            ...options,
          });
          return "tenantId_1_userId_1_date_1";
        },
      ),
    );
    t.mock.method(model, "countDocuments", async (filter) =>
      filter.$or ? 0 : 2,
    );
    t.mock.method(model, "aggregate", async () => []);
  }
  t.mock.method(console, "log", () => {});

  const report = await migrateAttendanceAndOutdoorDutyIndexes();

  assert.equal(report.Attendance.tenantUniqueIndexes, 1);
  assert.equal(report.OutdoorDuty.tenantUniqueIndexes, 1);
  assert.ok(methods.every((method) => method.mock.callCount() === 1));
});

test("attendance and admin attendance routes only query the authenticated tenant", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const foreignEmployeeId = new mongoose.Types.ObjectId();
  const employee = {
    _id: employeeId,
    tenantId: tenantA,
    name: "Tenant A employee",
    employeeId: "A-1",
    email: "a@example.com",
    role: "employee",
    isActive: true,
  };
  stubAuthentication(t, { _id: actorId, tenantId: tenantA, role: "admin" });

  const userFindFilters = [];
  t.mock.method(User, "find", (filter) => {
    userFindFilters.push(filter);
    return queryFor([employee]);
  });
  t.mock.method(User, "findOne", (filter) => {
    userFindFilters.push(filter);
    return queryFor(String(filter._id) === String(foreignEmployeeId) ? null : employee);
  });

  const attendanceFilters = [];
  const populateArgs = [];
  t.mock.method(Attendance, "find", (filter) => {
    attendanceFilters.push(filter);
    return queryFor([], { onPopulate: (argument) => populateArgs.push(argument) });
  });
  const attendanceCounts = [];
  t.mock.method(Attendance, "countDocuments", async (filter) => {
    attendanceCounts.push(filter);
    return 0;
  });
  const upserts = [];
  t.mock.method(Attendance, "findOneAndUpdate", async (...args) => {
    upserts.push(args);
    return {};
  });

  const attendanceHistory = await requestAs(
    "/api/attendance/my-history",
    actorId,
    "admin",
    tenantA,
  );
  const exportResponse = await requestAs(
    "/api/admin/export-attendance",
    actorId,
    "admin",
    tenantA,
  );
  const todayResponse = await requestAs(
    "/api/admin/today-employee-attendance",
    actorId,
    "admin",
    tenantA,
  );
  const employeeHistory = await requestAs(
    `/api/admin/employee-attendance-history?employeeId=${employeeId}`,
    actorId,
    "admin",
    tenantA,
  );
  const foreignDirectAttendance = await requestAs(
    "/api/admin/direct-attendance",
    actorId,
    "admin",
    tenantA,
    {
      method: "POST",
      body: JSON.stringify({
        employeeId: String(foreignEmployeeId),
        date: "2026-04-15",
        startTime: "09:00",
        endTime: "18:00",
      }),
    },
  );

  assert.equal(attendanceHistory.status, 200);
  assert.equal(exportResponse.status, 200);
  assert.equal(todayResponse.status, 200);
  assert.equal(employeeHistory.status, 200);
  assert.equal(foreignDirectAttendance.status, 404);
  assert.ok(attendanceFilters.length >= 4);
  assert.ok(attendanceFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.equal(attendanceCounts.length, 1);
  assert.equal(String(attendanceCounts[0].tenantId), String(tenantA));
  assert.deepEqual(populateArgs[0].match, { tenantId: tenantA });
  assert.ok(userFindFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.equal(String(userFindFilters.at(-1)._id), String(foreignEmployeeId));
  assert.equal(upserts.length, 0);
});

test("clock, heartbeat, today, and attendance-history routes query only Tenant A", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  stubAuthentication(t, { _id: actorId, tenantId: tenantA, role: "employee" });

  const findOneFilters = [];
  t.mock.method(Attendance, "findOne", async (filter) => {
    findOneFilters.push(filter);
    return null;
  });
  const creates = [];
  t.mock.method(Attendance, "create", async (attendance) => {
    creates.push(attendance);
    return attendance;
  });
  const findFilters = [];
  t.mock.method(Attendance, "find", (filter) => {
    findFilters.push(filter);
    return queryFor([]);
  });
  const countFilters = [];
  t.mock.method(Attendance, "countDocuments", async (filter) => {
    countFilters.push(filter);
    return 0;
  });

  const clockIn = await requestAs(
    "/api/attendance/clock-in",
    actorId,
    "employee",
    tenantA,
    { method: "POST" },
  );
  const clockOut = await requestAs(
    "/api/attendance/clock-out",
    actorId,
    "employee",
    tenantA,
    { method: "POST" },
  );
  const heartbeat = await requestAs(
    "/api/attendance/heartbeat",
    actorId,
    "employee",
    tenantA,
    { method: "POST" },
  );
  const today = await requestAs(
    "/api/attendance/today",
    actorId,
    "employee",
    tenantA,
  );
  const history = await requestAs(
    "/api/attendance/my-history",
    actorId,
    "employee",
    tenantA,
  );

  assert.equal(clockIn.status, 201);
  assert.equal(clockOut.status, 404);
  assert.equal(heartbeat.status, 200);
  assert.equal(today.status, 200);
  assert.equal(history.status, 200);
  assert.ok(findOneFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.ok(findFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.ok(countFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.equal(String(creates[0].tenantId), String(tenantA));
});

test("leave routes scope queries, writes, reviewers, and report aggregates to the tenant", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const reporteeId = new mongoose.Types.ObjectId();
  const foreignEmployeeId = new mongoose.Types.ObjectId();
  const crossTenantLeaveId = new mongoose.Types.ObjectId();
  const actor = {
    _id: actorId,
    tenantId: tenantA,
    role: "manager",
  };
  const authentication = stubAuthentication(t, actor);

  const applicant = {
    _id: actorId,
    tenantId: tenantA,
    leaveBalance: { casual: 3 },
    save: async () => {},
  };
  const userFindFilters = [];
  t.mock.method(User, "find", (filter) => {
    userFindFilters.push(filter);
    return queryFor([{ _id: reporteeId }]);
  });
  t.mock.method(User, "findOne", (filter) => {
    userFindFilters.push(filter);
    if (String(filter._id) === String(foreignEmployeeId)) {
      return queryFor(null);
    }
    return queryFor(applicant);
  });
  t.mock.method(User, "findOneAndUpdate", async () => applicant);

  const leaveFilters = [];
  const populated = [];
  t.mock.method(Leave, "find", (filter) => {
    leaveFilters.push(filter);
    return queryFor([], { onPopulate: (argument) => populated.push(argument) });
  });
  const leaveCounts = [];
  t.mock.method(Leave, "countDocuments", async (filter) => {
    leaveCounts.push(filter);
    return 0;
  });
  const leaveFindOneFilters = [];
  t.mock.method(Leave, "findOne", async (filter) => {
    leaveFindOneFilters.push(filter);
    if (String(filter._id) === String(crossTenantLeaveId)) {
      return {
        _id: crossTenantLeaveId,
        userId: foreignEmployeeId,
        status: "pending",
        leaveType: "casual",
        daysCount: 1,
        save: async () => {},
      };
    }
    return null;
  });
  const createdLeaves = [];
  t.mock.method(Leave, "create", async (data) => {
    createdLeaves.push(data);
    return data;
  });
  const aggregates = [];
  t.mock.method(Leave, "aggregate", async (pipeline) => {
    aggregates.push(pipeline);
    return [];
  });

  const ownLeaves = await requestAs(
    "/api/leaves/my-leaves",
    actorId,
    "manager",
    tenantA,
  );
  const teamLeaves = await requestAs(
    "/api/leaves/all",
    actorId,
    "manager",
    tenantA,
  );
  const reviewForeignLeave = await requestAs(
    `/api/leaves/${new mongoose.Types.ObjectId()}/review`,
    actorId,
    "manager",
    tenantA,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    },
  );
  const reviewCrossTenantApplicant = await requestAs(
    `/api/leaves/${crossTenantLeaveId}/review`,
    actorId,
    "manager",
    tenantA,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    },
  );
  const cancelForeignLeave = await requestAs(
    `/api/leaves/${new mongoose.Types.ObjectId()}/cancel`,
    actorId,
    "manager",
    tenantA,
    { method: "PATCH" },
  );
  const applyOwnLeave = await requestAs(
    "/api/leaves/apply",
    actorId,
    "manager",
    tenantA,
    {
      method: "POST",
      body: JSON.stringify({
        leaveType: "casual",
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        reason: "Personal",
      }),
    },
  );

  assert.equal(ownLeaves.status, 200);
  assert.equal(teamLeaves.status, 200);
  assert.equal(reviewForeignLeave.status, 404);
  assert.equal(reviewCrossTenantApplicant.status, 404);
  assert.equal(cancelForeignLeave.status, 404);
  assert.equal(applyOwnLeave.status, 201);
  assert.deepEqual(leaveFilters[0], { tenantId: tenantA, userId: actorId });
  assert.deepEqual(leaveFilters[1], {
    tenantId: tenantA,
    userId: { $in: [reporteeId] },
  });
  assert.ok(leaveCounts.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.deepEqual(userFindFilters[0], {
    tenantId: tenantA,
    reportingManager: actorId,
  });
  assert.deepEqual(populated[0].match, { tenantId: tenantA });
  assert.deepEqual(leaveFindOneFilters[0], {
    _id: reviewForeignLeave.url.split("/").at(-2),
    tenantId: tenantA,
    userId: { $in: [reporteeId] },
  });
  assert.deepEqual(leaveFindOneFilters[1], {
    _id: crossTenantLeaveId.toString(),
    tenantId: tenantA,
    userId: { $in: [reporteeId] },
  });
  assert.deepEqual(leaveFindOneFilters[2], {
    _id: cancelForeignLeave.url.split("/").at(-2),
    tenantId: tenantA,
    userId: actorId,
  });
  assert.equal(String(createdLeaves[0].tenantId), String(tenantA));
  assert.equal(String(createdLeaves[0].userId), String(actorId));

  const adminId = new mongoose.Types.ObjectId();
  authentication.setActor({
    _id: adminId,
    tenantId: tenantA,
    role: "admin",
  });
  const foreignAdminLeave = await requestAs(
    "/api/admin/apply-employee-leave",
    adminId,
    "admin",
    tenantA,
    {
      method: "POST",
      body: JSON.stringify({
        employeeId: String(foreignEmployeeId),
        leaveType: "casual",
        startDate: "2026-06-03",
        endDate: "2026-06-03",
      }),
    },
  );
  const leaveHistory = await requestAs(
    "/api/admin/leave-history",
    adminId,
    "admin",
    tenantA,
  );

  assert.equal(foreignAdminLeave.status, 404);
  assert.equal(leaveHistory.status, 200);
  assert.equal(String(userFindFilters.at(-1).tenantId), String(tenantA));
  assert.equal(String(userFindFilters.at(-1)._id), String(foreignEmployeeId));
  assert.deepEqual(
    userFindFilters.find(
      (filter) => String(filter._id) === String(foreignEmployeeId),
    ),
    {
    _id: foreignEmployeeId,
    tenantId: tenantA,
    },
  );
  assert.equal(String(aggregates[0][0].$match.tenantId), String(tenantA));
});

test("OutdoorDuty routes enforce tenant filters and tenant-stamp approved attendance", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const foreignRequestId = new mongoose.Types.ObjectId();
  const foreignApplicantId = new mongoose.Types.ObjectId();
  const crossTenantDutyId = new mongoose.Types.ObjectId();
  const actor = { _id: actorId, tenantId: tenantA, role: "admin" };
  stubAuthentication(t, actor);

  const userFindFilters = [];
  t.mock.method(User, "find", (filter) => {
    userFindFilters.push(filter);
    return queryFor([{ _id: actorId }]);
  });
  t.mock.method(User, "findOne", (filter) => {
    userFindFilters.push(filter);
    if (String(filter._id) === String(foreignApplicantId)) {
      return queryFor(null);
    }
    return queryFor({ _id: actorId, tenantId: tenantA });
  });

  const odFindFilters = [];
  const odFindOneFilters = [];
  const odDocument = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenantA,
    userId: actorId,
    date: "2026-07-04",
    startTime: "09:00",
    endTime: "18:00",
    status: "pending",
    save: async () => {},
  };
  const crossTenantOd = {
    ...odDocument,
    _id: crossTenantDutyId,
    userId: foreignApplicantId,
  };
  t.mock.method(OutdoorDuty, "find", (filter) => {
    odFindFilters.push(filter);
    return queryFor([]);
  });
  t.mock.method(OutdoorDuty, "countDocuments", async (filter) => {
    odFindFilters.push(filter);
    return 0;
  });
  t.mock.method(OutdoorDuty, "findOne", async (filter) => {
    odFindOneFilters.push(filter);
    if (filter._id) {
      if (String(filter._id) === String(foreignRequestId)) return null;
      if (String(filter._id) === String(crossTenantDutyId)) return crossTenantOd;
      return odDocument;
    }
    return null;
  });
  const createdDuty = [];
  t.mock.method(OutdoorDuty, "create", async (data) => {
    createdDuty.push(data);
    return data;
  });

  const attendanceFilters = [];
  t.mock.method(Attendance, "findOne", async (filter) => {
    attendanceFilters.push(filter);
    return null;
  });
  const createdAttendance = [];
  t.mock.method(Attendance, "create", async (data) => {
    createdAttendance.push(data);
    return data;
  });

  const myRequests = await requestAs(
    "/api/outdoor-duty/my-requests",
    actorId,
    "admin",
    tenantA,
  );
  const pendingRequests = await requestAs(
    "/api/outdoor-duty/pending",
    actorId,
    "admin",
    tenantA,
  );
  const newRequest = await requestAs(
    "/api/outdoor-duty",
    actorId,
    "admin",
    tenantA,
    {
      method: "POST",
      body: JSON.stringify({
        date: "2026-07-05",
        startTime: "09:00",
        endTime: "18:00",
        reason: "Client visit",
      }),
    },
  );
  const reviewForeignRequest = await requestAs(
    `/api/outdoor-duty/${foreignRequestId}/review`,
    actorId,
    "admin",
    tenantA,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    },
  );
  const reviewCrossTenantApplicant = await requestAs(
    `/api/outdoor-duty/${crossTenantDutyId}/review`,
    actorId,
    "admin",
    tenantA,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    },
  );
  const approveRequest = await requestAs(
    `/api/outdoor-duty/${odDocument._id}/review`,
    actorId,
    "admin",
    tenantA,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    },
  );

  assert.equal(myRequests.status, 200);
  assert.equal(pendingRequests.status, 200);
  assert.equal(newRequest.status, 201);
  assert.equal(reviewForeignRequest.status, 404);
  assert.equal(reviewCrossTenantApplicant.status, 404);
  assert.equal(approveRequest.status, 200);
  assert.deepEqual(odFindFilters[0], {
    tenantId: tenantA,
    userId: actorId,
  });
  assert.deepEqual(odFindFilters[1], {
    tenantId: tenantA,
    userId: actorId,
  });
  assert.deepEqual(odFindFilters[2], { tenantId: tenantA });
  assert.deepEqual(odFindFilters[3], { tenantId: tenantA });
  assert.ok(odFindOneFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.equal(String(createdDuty[0].tenantId), String(tenantA));
  assert.equal(String(attendanceFilters[0].tenantId), String(tenantA));
  assert.equal(String(createdAttendance[0].tenantId), String(tenantA));
  assert.deepEqual(userFindFilters.at(-1), {
    _id: actorId,
    tenantId: tenantA,
  });
});

test("outdoor-duty aliases and combined listing remain tenant-scoped", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const foreignDutyId = new mongoose.Types.ObjectId();
  const authentication = stubAuthentication(t, {
    _id: actorId,
    tenantId: tenantA,
    role: "employee",
  });

  const findFilters = [];
  t.mock.method(OutdoorDuty, "find", (filter) => {
    findFilters.push(filter);
    return queryFor([]);
  });
  t.mock.method(OutdoorDuty, "countDocuments", async (filter) => {
    findFilters.push(filter);
    return 0;
  });
  t.mock.method(User, "find", (filter) => {
    assert.equal(String(filter.tenantId), String(tenantA));
    return queryFor([]);
  });
  const findOneFilters = [];
  t.mock.method(OutdoorDuty, "findOne", async (filter) => {
    findOneFilters.push(filter);
    return null;
  });
  const creates = [];
  t.mock.method(OutdoorDuty, "create", async (data) => {
    creates.push(data);
    return data;
  });

  const combinedList = await requestAs(
    "/api/outdoor-duty",
    actorId,
    "employee",
    tenantA,
  );
  const applyAlias = await requestAs(
    "/api/outdoor-duty/apply",
    actorId,
    "employee",
    tenantA,
    {
      method: "POST",
      body: JSON.stringify({
        date: "2026-07-06",
        startTime: "09:00",
        endTime: "18:00",
        reason: "Customer meeting",
      }),
    },
  );
  authentication.setActor({ _id: actorId, tenantId: tenantA, role: "manager" });
  const approveAlias = await requestAs(
    `/api/outdoor-duty/${foreignDutyId}/approve`,
    actorId,
    "manager",
    tenantA,
    { method: "PATCH" },
  );
  const rejectAlias = await requestAs(
    `/api/outdoor-duty/${foreignDutyId}/reject`,
    actorId,
    "manager",
    tenantA,
    { method: "PATCH" },
  );

  assert.equal(combinedList.status, 200);
  assert.equal(applyAlias.status, 201);
  assert.equal(approveAlias.status, 404);
  assert.equal(rejectAlias.status, 404);
  assert.ok(findFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
  assert.equal(String(creates[0].tenantId), String(tenantA));
  assert.equal(findOneFilters.length, 3);
  assert.ok(findOneFilters.every((filter) => String(filter.tenantId) === String(tenantA)));
});
