import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const TEST_SECRET = "holiday-tenant-tests-only";
process.env.JWT_SECRET = TEST_SECRET;
process.env.JWT_EXPIRES_IN = "1h";

const [
  { default: app },
  { User },
  { default: Tenant },
  { default: Holiday },
  { migrateHolidayTenantIndex },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/User.js"),
  import("../src/models/Tenant.js"),
  import("../src/models/Holiday.js"),
  import("../scripts/migrations/002-scope-holiday-index.js"),
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

test("Holiday date uniqueness is tenant-scoped", () => {
  const datePath = Holiday.schema.path("date");
  assert.notEqual(datePath.options.unique, true);
  assert.ok(
    Holiday.schema.indexes().some(
      ([keys, options]) =>
        keys.tenantId === 1 &&
        keys.date === 1 &&
        options.unique === true,
    ),
  );
});

const queryFor = (value) => ({
  lean: () => Promise.resolve(value),
  select() {
    return this;
  },
  sort() {
    return this;
  },
  where() {
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

const requestAs = (url, tenantUserId, tenantId, options = {}) =>
  fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      Authorization: `Bearer ${jwt.sign(
        { id: tenantUserId, role: "admin", tenantId },
        TEST_SECRET,
      )}`,
      ...options.headers,
    },
  });

test("Tenant A cannot read, edit, or delete Tenant B holidays", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const holidayA = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenantA,
    date: "2026-01-01",
    title: "Tenant A holiday",
    description: "",
  };
  const holidayB = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenantB,
    date: "2026-01-01",
    title: "Tenant B holiday",
    description: "",
  };
  const tenantAUser = { _id: userId, tenantId: tenantA, role: "admin" };

  t.mock.method(User, "findById", () => queryFor(tenantAUser));
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      status: "active",
      plan: "free",
      billing: { status: "inactive" },
    }),
  );

  let listFilter;
  t.mock.method(Holiday, "find", (filter) => {
    listFilter = filter;
    return queryFor(
      [holidayA, holidayB].filter(
        (holiday) => String(holiday.tenantId) === String(filter.tenantId),
      ),
    );
  });
  let countFilter;
  t.mock.method(Holiday, "countDocuments", async (filter) => {
    countFilter = filter;
    return 1;
  });

  const visibleResponse = await requestAs(
    "/api/holidays",
    String(userId),
    String(tenantA),
  );
  assert.equal(visibleResponse.status, 200);
  const visibleBody = await visibleResponse.json();
  assert.deepEqual(listFilter, { tenantId: tenantA });
  assert.deepEqual(countFilter, { tenantId: tenantA });
  assert.deepEqual(
    visibleBody.data.holidays.map((holiday) => holiday.title),
    ["Tenant A holiday"],
  );

  const findOneFilters = [];
  t.mock.method(Holiday, "findOne", async (filter) => {
    findOneFilters.push(filter);
    return null;
  });
  const deleteFilters = [];
  t.mock.method(Holiday, "findOneAndDelete", async (filter) => {
    deleteFilters.push(filter);
    return null;
  });

  const updateResponse = await requestAs(
    `/api/holidays/${holidayB._id}`,
    String(userId),
    String(tenantA),
    {
      method: "PUT",
      body: JSON.stringify({
        date: "2026-02-01",
        title: "Changed by Tenant A",
        tenantId: String(tenantB),
      }),
    },
  );
  const deleteResponse = await requestAs(
    `/api/holidays/${holidayB._id}`,
    String(userId),
    String(tenantA),
    { method: "DELETE" },
  );

  assert.equal(updateResponse.status, 404);
  assert.equal(deleteResponse.status, 404);
  assert.deepEqual(findOneFilters[0], {
    _id: String(holidayB._id),
    tenantId: tenantA,
  });
  assert.deepEqual(deleteFilters[0], {
    _id: String(holidayB._id),
    tenantId: tenantA,
  });
  assert.equal(holidayB.title, "Tenant B holiday");
});

test("holiday creates and CSV imports always use the authenticated tenant", async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, "findById", () =>
    queryFor({ _id: userId, tenantId: tenantA, role: "admin" }),
  );
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      status: "active",
      plan: "free",
      billing: { status: "inactive" },
    }),
  );

  const duplicateFilters = [];
  t.mock.method(Holiday, "findOne", async (filter) => {
    duplicateFilters.push(filter);
    return null;
  });
  const creates = [];
  t.mock.method(Holiday, "create", async (holiday) => {
    creates.push(holiday);
    return holiday;
  });
  let importRows = [];
  t.mock.method(Holiday, "insertMany", async (holidays) => {
    importRows = holidays;
    return holidays;
  });
  t.mock.method(console, "log", () => {});

  const createResponse = await requestAs(
    "/api/holidays",
    String(userId),
    String(tenantA),
    {
      method: "POST",
      body: JSON.stringify({
        date: "2026-01-02",
        title: "Tenant A created",
        tenantId: String(tenantB),
      }),
    },
  );
  assert.equal(createResponse.status, 201);
  assert.equal(String(creates[0].tenantId), String(tenantA));
  assert.deepEqual(duplicateFilters[0], {
    tenantId: tenantA,
    date: "2026-01-02",
  });

  const formData = new FormData();
  formData.append(
    "file",
    new Blob(["date,holiday\n2026-01-03,Tenant A imported"], {
      type: "text/csv",
    }),
    "holidays.csv",
  );
  const importResponse = await requestAs(
    "/api/holidays/import",
    String(userId),
    String(tenantA),
    { method: "POST", body: formData },
  );

  assert.equal(importResponse.status, 200);
  assert.deepEqual(duplicateFilters[1], {
    tenantId: tenantA,
    date: "2026-01-03",
  });
  assert.equal(String(importRows[0].tenantId), String(tenantA));
});

test("holiday index migration dry-run reports counts without changing indexes", async (t) => {
  const oldIndexes = [
    { name: "_id_", key: { _id: 1 } },
    { name: "date_1", key: { date: 1 }, unique: true },
  ];
  const dropIndex = t.mock.method(
    Holiday.collection,
    "dropIndex",
    async () => {},
  );
  const createIndex = t.mock.method(
    Holiday.collection,
    "createIndex",
    async () => "tenantId_1_date_1",
  );
  t.mock.method(Holiday.collection, "indexes", async () => oldIndexes);
  t.mock.method(Holiday, "countDocuments", async (filter) =>
    filter.$or ? 0 : 7,
  );
  t.mock.method(Holiday, "aggregate", async () => []);
  t.mock.method(console, "log", () => {});

  const counts = await migrateHolidayTenantIndex({ dryRun: true });

  assert.equal(counts.totalHolidays, 7);
  assert.equal(counts.globalDateUniqueIndexes, 1);
  assert.equal(counts.tenantDateUniqueIndexes, 0);
  assert.equal(dropIndex.mock.callCount(), 0);
  assert.equal(createIndex.mock.callCount(), 0);
});
