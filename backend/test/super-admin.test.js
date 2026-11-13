import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const TENANT_SECRET = "tenant-jwt-test-secret";
const SUPER_SECRET = "super-jwt-test-secret";
process.env.JWT_SECRET = TENANT_SECRET;
process.env.SUPER_JWT_SECRET = SUPER_SECRET;
process.env.JWT_EXPIRES_IN = "1h";

const [
  { default: app },
  { default: Tenant },
  { User },
  { default: SuperAdmin },
  { default: SuperAdminAuditLog },
  { emailTransport },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/Tenant.js"),
  import("../src/models/User.js"),
  import("../src/models/SuperAdmin.js"),
  import("../src/models/SuperAdminAuditLog.js"),
  import("../src/utils/email.js"),
]);
const { seedSuperAdmin } = await import("../scripts/seedSuperAdmin.js");
const { ENV } = await import("../src/config/env.js");
const { API_ROUTE_PREFIXES, SUPER_ADMIN_API_PREFIX } =
  await import("../src/routes/index.js");
const { SUPER_ADMIN_AUTH_LOGIN_PATH } =
  await import("../src/routes/superAdmin.routes.js");

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
  lean() {
    return this;
  },
  select() {
    return this;
  },
  sort() {
    return this;
  },
  populate() {
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

const aggregateFor = (value, onOption) => ({
  option(options) {
    onOption?.(options);
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const request = (url, options = {}) =>
  fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

const superToken = (id = "super-admin-id") =>
  jwt.sign({ id, type: "super" }, SUPER_SECRET);

const tenantToken = () =>
  jwt.sign(
    {
      id: "tenant-admin-id",
      role: "admin",
      tenantId: "0123456789abcdef01234567",
    },
    TENANT_SECRET,
  );

const stubSuperAdmin = (t, id = "super-admin-id") =>
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: id, name: "Platform Admin", email: "root@example.com" }),
  );

test("Super Admin login route is included in the mounted API prefixes", () => {
  assert.equal(
    `${SUPER_ADMIN_API_PREFIX}${SUPER_ADMIN_AUTH_LOGIN_PATH}`,
    "/api/super/auth/login",
  );
  assert.ok(API_ROUTE_PREFIXES.includes(SUPER_ADMIN_API_PREFIX));
});

test("tenant tokens are rejected by super routes and super tokens by tenant routes", async (t) => {
  const auditCreate = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );
  const crossTenantAggregates = t.mock.method(User, "aggregate", () => {
    throw new Error("tenant token must not reach cross-tenant aggregation");
  });
  const tenantTokenResponse = await request(
    "/api/super/tenants?allowCrossTenant=true",
    {
      headers: { Authorization: `Bearer ${tenantToken()}` },
    },
  );
  const superTokenResponse = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${superToken()}` },
  });

  assert.equal(tenantTokenResponse.status, 401);
  assert.equal(superTokenResponse.status, 401);
  assert.equal(auditCreate.mock.callCount(), 0);
  assert.equal(crossTenantAggregates.mock.callCount(), 0);
});

test("suspended tenants cannot log in", async (t) => {
  t.mock.method(Tenant, "findOne", async () => ({
    _id: "tenant-a",
    status: "suspended",
  }));
  const userLookup = t.mock.method(User, "findOne", () => {
    throw new Error("suspended tenants must not query users");
  });

  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      companySlug: "company-a",
      email: "admin@example.com",
      password: "password123",
    }),
  });

  assert.equal(response.status, 403);
  assert.equal(userLookup.mock.callCount(), 0);
});

test("super-admin login uses the separate model, secret, and claim type", async (t) => {
  const admin = {
    _id: "super-admin-id",
    name: "Platform Admin",
    email: "root@example.com",
    isPasswordCorrect: async (password) => password === "correct-password",
  };
  t.mock.method(SuperAdmin, "findOne", () => queryFor(admin));
  const audit = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );

  const response = await request("/api/super/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "ROOT@example.com",
      password: "correct-password",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(jwt.verify(body.data.token, SUPER_SECRET), {
    id: "super-admin-id",
    type: "super",
    iat: jwt.decode(body.data.token).iat,
    exp: jwt.decode(body.data.token).exp,
  });
  assert.equal(audit.mock.callCount(), 1);
  assert.equal(audit.mock.calls[0].arguments[0].action, "POST /api/super/auth/login");
});

test("tenant listing supports pagination and filters and is audited", async (t) => {
  stubSuperAdmin(t);
  const tenant = {
    _id: "tenant-a",
    name: "Acme",
    slug: "acme",
    status: "trial",
    plan: "basic",
  };
  const zeroEmployeeTenant = {
    _id: "tenant-with-no-employees",
    name: "New Company",
    slug: "new-company",
    status: "trial",
    plan: "free",
  };
  let filter;
  t.mock.method(Tenant, "countDocuments", async () => 11);
  let pipeline;
  let aggregateOptions;
  t.mock.method(User, "aggregate", (value) => {
    pipeline = value;
    return aggregateFor([{ _id: "tenant-a", count: 23 }], (options) => {
      aggregateOptions = options;
    });
  });
  t.mock.method(Tenant, "find", (value) => {
    filter = value;
    return queryFor([tenant, zeroEmployeeTenant]);
  });
  const audit = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );

  const response = await request(
    "/api/super/tenants?page=2&limit=5&search=acme&status=trial&plan=basic",
    { headers: { Authorization: `Bearer ${superToken()}` } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(filter, {
    status: "trial",
    plan: "basic",
    $or: [
      { name: { $regex: "acme", $options: "i" } },
      { slug: { $regex: "acme", $options: "i" } },
    ],
  });
  assert.equal(body.data.pagination.page, 2);
  assert.equal(body.data.pagination.limit, 5);
  assert.equal(body.data.pagination.total, 11);
  assert.equal(body.data.tenants[0].employeeCount, 23);
  assert.equal(body.data.tenants[1].employeeCount, 0);
  assert.deepEqual(pipeline[0].$match.tenantId.$in, [
    "tenant-a",
    "tenant-with-no-employees",
  ]);
  assert.deepEqual(aggregateOptions, { allowCrossTenant: true });
  assert.equal(audit.mock.calls[0].arguments[0].action, "GET /api/super/tenants");
});

test("tenant audit history is paginated, tenant-filtered, and audited", async (t) => {
  stubSuperAdmin(t);
  const auditHistory = [
    {
      _id: "audit-1",
      tenantId: "0123456789abcdef01234567",
      action: "PATCH /api/super/tenants/0123456789abcdef01234567",
      time: new Date("2026-11-12T10:00:00.000Z"),
      who: { name: "Platform Admin", email: "root@example.com" },
    },
  ];
  let filter;
  t.mock.method(SuperAdminAuditLog, "find", (value) => {
    filter = value;
    return queryFor(auditHistory);
  });
  t.mock.method(SuperAdminAuditLog, "countDocuments", async () => 1);
  const audit = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );

  const response = await request(
    "/api/super/tenants/0123456789abcdef01234567/audit?page=1&limit=5",
    { headers: { Authorization: `Bearer ${superToken()}` } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(filter, { tenantId: "0123456789abcdef01234567" });
  assert.equal(body.data.auditHistory.length, 1);
  assert.equal(body.data.auditHistory[0].who.name, "Platform Admin");
  assert.equal(body.data.pagination.total, 1);
  assert.equal(audit.mock.calls[0].arguments[0].tenantId, "0123456789abcdef01234567");
});

test("tenant provisioning creates its first HR admin and emails company credentials", async (t) => {
  stubSuperAdmin(t);
  t.mock.method(Tenant, "findOne", async () => null);
  const createdTenants = [];
  t.mock.method(Tenant, "create", async (data) => {
    const tenant = { ...data, _id: "new-tenant-id" };
    createdTenants.push(tenant);
    return tenant;
  });
  const createdUsers = [];
  t.mock.method(User, "create", async (data) => {
    const user = { ...data, _id: "first-admin-id" };
    createdUsers.push(user);
    return user;
  });
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));
  const audit = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({ _id: "provision-audit-id" }),
  );
  const linkedAudit = t.mock.method(
    SuperAdminAuditLog,
    "updateOne",
    async () => ({ modifiedCount: 1 }),
  );

  const response = await request("/api/super/tenants", {
    method: "POST",
    headers: { Authorization: `Bearer ${superToken()}` },
    body: JSON.stringify({
      name: "Acme Company",
      slug: "acme-company",
      plan: "pro",
      adminName: "A. Admin",
      adminEmail: "ADMIN@ACME.COM",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(createdTenants[0].status, "active");
  assert.equal(createdTenants[0].trialEndsAt, null);
  assert.deepEqual(createdTenants[0].onboarding, { completed: false, step: 1 });
  assert.equal(String(createdUsers[0].tenantId), "new-tenant-id");
  assert.equal(createdUsers[0].role, "admin");
  assert.equal(createdUsers[0].email, "admin@acme.com");
  assert.match(createdUsers[0].employeeId, /^HR-[A-F0-9]+$/);
  assert.equal(sendMail.mock.callCount(), 1);
  const message = sendMail.mock.calls[0].arguments[0];
  assert.equal(message.to, "admin@acme.com");
  assert.match(message.html, /Company Code:<\/strong> acme-company/);
  assert.match(message.html, /http:\/\/localhost:5173\/\?companySlug=acme-company/);
  assert.ok(message.html.includes(createdUsers[0].password));
  assert.equal(body.data.tenant.slug, "acme-company");
  assert.equal(body.data.admin.id, "first-admin-id");
  assert.equal(JSON.stringify(body).includes(createdUsers[0].password), false);
  assert.equal(audit.mock.calls[0].arguments[0].tenantId, null);
  assert.deepEqual(linkedAudit.mock.calls[0].arguments, [
    { _id: "provision-audit-id", who: "super-admin-id" },
    { $set: { tenantId: "new-tenant-id" } },
  ]);
});

test("Super Admin can explicitly create a 14-day trial tenant", async (t) => {
  stubSuperAdmin(t);
  t.mock.method(Tenant, "findOne", async () => null);
  let createdTenant;
  t.mock.method(Tenant, "create", async (data) => {
    createdTenant = { ...data, _id: "trial-tenant-id" };
    return createdTenant;
  });
  t.mock.method(User, "create", async (data) => ({
    ...data,
    _id: "trial-admin-id",
  }));
  t.mock.method(emailTransport, "sendMail", async () => ({}));
  t.mock.method(SuperAdminAuditLog, "create", async () => ({
    _id: "trial-audit-id",
  }));
  t.mock.method(SuperAdminAuditLog, "updateOne", async () => ({}));
  const startedAt = Date.now();

  const response = await request("/api/super/tenants", {
    method: "POST",
    headers: { Authorization: `Bearer ${superToken()}` },
    body: JSON.stringify({
      name: "Trial Company",
      slug: "trial-company",
      status: "trial",
      plan: "pro",
      adminName: "Trial Admin",
      adminEmail: "admin@trial-company.com",
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(createdTenant.status, "trial");
  assert.ok(createdTenant.trialEndsAt instanceof Date);
  assert.ok(createdTenant.trialEndsAt.getTime() >= startedAt + 14 * 24 * 60 * 60 * 1000 - 1000);
  assert.ok(createdTenant.trialEndsAt.getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000);
});

test("tenant details include employee usage, latest login, and creation date", async (t) => {
  stubSuperAdmin(t);
  const createdAt = new Date("2026-01-02T00:00:00.000Z");
  const lastLoginAt = new Date("2026-06-07T08:09:10.000Z");
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      _id: "0123456789abcdef01234567",
      name: "Acme",
      slug: "acme",
      plan: "basic",
      employeeLimitOverride: null,
      createdAt,
    }),
  );
  t.mock.method(User, "countDocuments", async (filter) => {
    assert.equal(String(filter.tenantId), "0123456789abcdef01234567");
    assert.deepEqual(filter.role, { $ne: "admin" });
    assert.deepEqual(filter.isActive, { $ne: false });
    return 17;
  });
  t.mock.method(User, "findOne", (filter) => {
    assert.equal(String(filter.tenantId), "0123456789abcdef01234567");
    return queryFor({ lastLoginAt });
  });
  t.mock.method(SuperAdminAuditLog, "create", async () => ({}));

  const response = await request(
    "/api/super/tenants/0123456789abcdef01234567",
    { headers: { Authorization: `Bearer ${superToken()}` } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.usage.employeeCount, 17);
  assert.equal(body.data.usage.lastLoginAt, lastLoginAt.toISOString());
  assert.equal(body.data.usage.createdAt, createdAt.toISOString());
});

test("tenant detail, status and soft-delete mutations are audited", async (t) => {
  stubSuperAdmin(t);
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      _id: "0123456789abcdef01234567",
      plan: "free",
      employeeLimitOverride: null,
      status: "active",
    }),
  );
  t.mock.method(User, "countDocuments", async () => 0);
  const mutations = [];
  t.mock.method(Tenant, "findOneAndUpdate", (filter, update) => {
    mutations.push({ filter, update });
    return queryFor({
      _id: filter._id,
      status: update.$set.status || "active",
      ...update.$set,
    });
  });
  const audit = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );
  const headers = { Authorization: `Bearer ${superToken()}` };

  const update = await request("/api/super/tenants/0123456789abcdef01234567", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "Acme Renamed", plan: "basic" }),
  });
  const status = await request(
    "/api/super/tenants/0123456789abcdef01234567/status",
    { method: "PATCH", headers, body: JSON.stringify({ status: "suspended" }) },
  );
  const deletion = await request(
    "/api/super/tenants/0123456789abcdef01234567",
    { method: "DELETE", headers },
  );
  const deletionBody = await deletion.json();

  assert.equal(update.status, 200);
  assert.equal(status.status, 200);
  assert.equal(deletion.status, 200);
  assert.deepEqual(mutations[0].update.$set, {
    name: "Acme Renamed",
    plan: "basic",
    employeeLimitOverride: null,
  });
  assert.deepEqual(mutations[1].update.$set, { status: "suspended" });
  assert.equal(mutations[2].update.$set.status, "deleted");
  assert.equal(
    mutations[2].update.$set.purgeAfter.getTime() -
      mutations[2].update.$set.deletedAt.getTime(),
    30 * 24 * 60 * 60 * 1000,
  );
  assert.equal(deletionBody.data.purgeAfter, mutations[2].update.$set.purgeAfter.toISOString());
  assert.equal(audit.mock.callCount(), 3);
  assert.ok(
    audit.mock.calls.every((call) => call.arguments[0].tenantId),
    JSON.stringify(audit.mock.calls.map((call) => call.arguments[0])),
  );
});

test("plan downgrades respect active employee capacity and custom limits are audited", async (t) => {
  stubSuperAdmin(t);
  const tenantId = "0123456789abcdef01234567";
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      _id: tenantId,
      plan: "basic",
      employeeLimitOverride: null,
      status: "active",
    }),
  );
  const employeeCount = t.mock.method(User, "countDocuments", async (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    assert.deepEqual(filter.role, { $ne: "admin" });
    assert.deepEqual(filter.isActive, { $ne: false });
    return 15;
  });
  const mutations = [];
  t.mock.method(Tenant, "findOneAndUpdate", (filter, update) => {
    mutations.push({ filter, update });
    return queryFor({
      _id: tenantId,
      plan: "basic",
      employeeLimitOverride: update.$set.employeeLimitOverride,
    });
  });
  t.mock.method(SuperAdminAuditLog, "create", async () => ({ _id: "audit-plan" }));
  const auditDetails = t.mock.method(SuperAdminAuditLog, "updateOne", async () => ({}));
  const headers = { Authorization: `Bearer ${superToken()}` };

  const downgrade = await request(`/api/super/tenants/${tenantId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ plan: "free" }),
  });
  const override = await request(`/api/super/tenants/${tenantId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ employeeLimitOverride: 20 }),
  });
  const overrideBody = await override.json();

  assert.equal(downgrade.status, 409);
  assert.equal(override.status, 200);
  assert.equal(mutations.length, 1);
  assert.equal(employeeCount.mock.callCount(), 2);
  assert.equal(overrideBody.data.effectiveEmployeeLimit, 20);
  assert.deepEqual(auditDetails.mock.calls[0].arguments[1].$set.details, {
    oldPlan: "basic",
    newPlan: "basic",
    oldEmployeeLimitOverride: null,
    newEmployeeLimitOverride: 20,
  });
});

test("platform stats exclude deleted tenants and count employees across tenants", async (t) => {
  stubSuperAdmin(t);
  t.mock.method(Tenant, "countDocuments", async (filter) => {
    if (filter.status === "active") return 2;
    if (filter.status === "trial") return 3;
    if (filter.status === "suspended") return 1;
    return 6;
  });
  t.mock.method(Tenant, "find", () =>
    queryFor([{ _id: "tenant-a" }, { _id: "tenant-b" }]),
  );
  let pipeline;
  let aggregateOptions;
  t.mock.method(User, "aggregate", (value) => {
    pipeline = value;
    return aggregateFor(
      [
        { _id: "tenant-a", count: 23 },
        { _id: "tenant-b", count: 35 },
      ],
      (options) => {
        aggregateOptions = options;
      },
    );
  });
  t.mock.method(SuperAdminAuditLog, "create", async () => ({}));

  const response = await request("/api/super/stats", {
    headers: { Authorization: `Bearer ${superToken()}` },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, {
    totalTenants: 6,
    activeTenants: 2,
    trialTenants: 3,
    suspendedTenants: 1,
    totalEmployees: 58,
  });
  const employeeFilter = pipeline[0].$match;
  assert.deepEqual(employeeFilter.tenantId, { $in: ["tenant-a", "tenant-b"] });
  assert.deepEqual(employeeFilter.role, { $ne: "admin" });
  assert.deepEqual(employeeFilter.isActive, { $ne: false });
  assert.deepEqual(aggregateOptions, { allowCrossTenant: true });
});

test("Super Admin seed creates and updates only the configured platform account", async (t) => {
  let storedAdmin = null;
  let createCount = 0;
  let saveCount = 0;
  const seedLogs = t.mock.method(console, "log", () => {});
  const makeStoredAdmin = async (data) => {
    const admin = {
      ...data,
      password: await bcrypt.hash(data.password, 12),
      isPasswordCorrect: (password) => bcrypt.compare(password, admin.password),
      save: async () => {
        saveCount++;
        admin.password = await bcrypt.hash(admin.password, 12);
      },
    };
    return admin;
  };
  t.mock.method(SuperAdmin, "findOne", () => queryFor(storedAdmin));
  t.mock.method(SuperAdmin, "create", async (data) => {
    createCount++;
    storedAdmin = await makeStoredAdmin(data);
    return storedAdmin;
  });

  await seedSuperAdmin({
    email: "ROOT@EXAMPLE.COM",
    password: "a-secure-platform-password",
    name: "Platform Root",
  });
  await seedSuperAdmin({
    email: "root@example.com",
    password: "a-secure-platform-password",
    name: "Platform Root",
  });
  await seedSuperAdmin({
    email: "root@example.com",
    password: "a-new-secure-platform-password",
    name: "Platform Root",
  });

  assert.equal(createCount, 1);
  assert.equal(saveCount, 1);
  assert.equal(storedAdmin.email, "root@example.com");
  assert.equal(
    await storedAdmin.isPasswordCorrect("a-secure-platform-password"),
    false,
  );
  assert.equal(
    await storedAdmin.isPasswordCorrect("a-new-secure-platform-password"),
    true,
  );
  assert.match(seedLogs.mock.calls[0].arguments[0], /Created account/);
  assert.match(seedLogs.mock.calls[1].arguments[0], /No changes/);
  assert.match(seedLogs.mock.calls[2].arguments[0], /Updated password/);
});

test("seeded Super Admin credentials can log in through the API", async (t) => {
  let storedAdmin = null;
  const findFilters = [];
  const selectedFields = [];
  const seedLogs = t.mock.method(console, "log", () => {});
  t.mock.method(SuperAdmin, "findOne", (filter) => {
    findFilters.push(filter);
    return {
      ...queryFor(storedAdmin),
      select(field) {
        selectedFields.push(field);
        return this;
      },
    };
  });
  t.mock.method(SuperAdmin, "create", async (data) => {
    const admin = {
      ...data,
      _id: "seeded-super-admin-id",
      password: await bcrypt.hash(data.password, 12),
      isPasswordCorrect(password) {
        return bcrypt.compare(password, this.password);
      },
    };
    storedAdmin = admin;
    return admin;
  });
  const audit = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );

  await seedSuperAdmin({
    email: "ROOT@EXAMPLE.COM",
    password: "a-secure-platform-password",
    name: "Platform Root",
  });
  const response = await request("/api/super/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: " ROOT@EXAMPLE.COM ",
      password: "a-secure-platform-password",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.superAdmin.email, "root@example.com");
  assert.equal(
    jwt.verify(body.data.token, SUPER_SECRET).type,
    "super",
  );
  assert.deepEqual(findFilters, [
    { email: "root@example.com" },
    { email: "root@example.com" },
  ]);
  assert.deepEqual(selectedFields, ["+password", "+password"]);
  assert.equal(audit.mock.callCount(), 1);
  assert.match(seedLogs.mock.calls[0].arguments[0], /Created account/);
});

test("Super Admin seed reads default credentials from the environment config", async (t) => {
  const originalValues = {
    email: ENV.SUPER_ADMIN_EMAIL,
    password: ENV.SUPER_ADMIN_PASSWORD,
    name: ENV.SUPER_ADMIN_NAME,
  };
  Object.assign(ENV, {
    SUPER_ADMIN_EMAIL: "root@example.com",
    SUPER_ADMIN_PASSWORD: "a-secure-platform-password",
    SUPER_ADMIN_NAME: "Platform Root",
  });
  t.after(() => {
    Object.assign(ENV, {
      SUPER_ADMIN_EMAIL: originalValues.email,
      SUPER_ADMIN_PASSWORD: originalValues.password,
      SUPER_ADMIN_NAME: originalValues.name,
    });
  });

  t.mock.method(SuperAdmin, "findOne", () => queryFor(null));
  t.mock.method(SuperAdmin, "create", async (data) => data);

  const superAdmin = await seedSuperAdmin();
  assert.equal(superAdmin.email, "root@example.com");
  assert.equal(superAdmin.password, "a-secure-platform-password");
  assert.equal(superAdmin.name, "Platform Root");
});
