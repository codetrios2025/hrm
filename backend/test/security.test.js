import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const TEST_SECRET = "hrm-security-tests-only";
process.env.JWT_SECRET = TEST_SECRET;
process.env.JWT_EXPIRES_IN = "1h";

const [{ default: app }, { User }, { Leave }, { default: Tenant }] =
  await Promise.all([
  import("../src/app.js"),
  import("../src/models/User.js"),
  import("../src/models/Leave.js"),
  import("../src/models/Tenant.js"),
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

const TEST_TENANT_ID = "0123456789abcdef01234567";
const tokenFor = (id, role, tenantId = TEST_TENANT_ID) =>
  jwt.sign({ id, role, tenantId }, TEST_SECRET);

const request = (url, options = {}) =>
  fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });

const queryFor = (value) => ({
  lean: () => Promise.resolve(value),
  select() {
    return this;
  },
  where() {
    return this;
  },
  populate() {
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

const authenticatedUserStub = (t, users) => {
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      _id: TEST_TENANT_ID,
      status: "active",
      plan: "pro",
      employeeLimitOverride: null,
      billing: { status: "active" },
    }),
  );
  return t.mock.method(User, "findById", (id) => {
    const user = users.get(String(id));
    return queryFor(
      user
        ? { ...user, tenantId: user.tenantId ?? TEST_TENANT_ID, _id: id }
        : null,
    );
  });
};

test("public registration always creates an employee", async (t) => {
  const createdUsers = [];
  t.mock.method(Tenant, "findOne", async () => ({
    _id: TEST_TENANT_ID,
    status: "active",
    plan: "free",
    billing: { status: "inactive" },
  }));
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      status: "active",
      plan: "free",
      employeeLimitOverride: null,
      billing: { status: "inactive" },
    }),
  );
  t.mock.method(User, "countDocuments", async () => 0);
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async (data) => {
    createdUsers.push(data);
    return { ...data, _id: `registered-${createdUsers.length}` };
  });

  for (const role of ["admin", "manager"]) {
    const response = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        companySlug: "default",
        name: "Test User",
        email: `${role}@example.com`,
        password: "password123",
        role,
      }),
    });

    assert.equal(response.status, 201);
  }

  assert.deepEqual(
    createdUsers.map((user) => user.role),
    ["employee", "employee"],
  );
});

test("registration is blocked when the tenant has no employee seats left", async (t) => {
  const tenant = {
    _id: TEST_TENANT_ID,
    status: "active",
    plan: "free",
    employeeLimitOverride: null,
    billing: { status: "inactive" },
  };
  t.mock.method(Tenant, "findOne", async () => tenant);
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  t.mock.method(User, "countDocuments", async () => 10);

  const response = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      companySlug: "default",
      name: "One more",
      email: "one-more@example.com",
      password: "password123",
    }),
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "PLAN_LIMIT_REACHED");
});

test("login scopes email lookup to the company code", async (t) => {
  const tenantA = "tenant-a-id";
  let userFilter;
  t.mock.method(Tenant, "findOne", async () => ({
    _id: tenantA,
    status: "active",
  }));
  t.mock.method(User, "findOne", (filter) => {
    userFilter = filter;
    return queryFor(null);
  });

  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      companySlug: "company-a",
      email: "shared@example.com",
      password: "password123",
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(userFilter, {
    tenantId: tenantA,
    email: "shared@example.com",
  });
});

test("login issues a JWT containing the resolved tenant ID", async (t) => {
  const tenantId = "tenant-a-id";
  const userId = "tenant-a-user";
  const user = {
    _id: userId,
    tenantId,
    role: "employee",
    isActive: true,
    emailVerified: false,
    save: async () => {},
    isPasswordCorrect: async (password) => password === "password123",
  };
  t.mock.method(Tenant, "findOne", async () => ({
    _id: tenantId,
    status: "active",
  }));
  t.mock.method(User, "findOne", (filter) => {
    assert.deepEqual(filter, {
      tenantId,
      email: "worker@example.com",
    });
    return queryFor(user);
  });

  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      companySlug: "company-a",
      email: "worker@example.com",
      password: "password123",
    }),
  });

  assert.equal(response.status, 200);
  const { data } = await response.json();
  const { id, role, tenantId: claimTenantId } = jwt.decode(data.token);
  assert.deepEqual(
    { id, role, tenantId: claimTenantId },
    { id: userId, role: "employee", tenantId },
  );
  assert.equal(data.user.emailVerified, false);
});

test("forgot/reset password and authenticated auth routes stay tenant-scoped", async (t) => {
  const tenantId = TEST_TENANT_ID;
  const userId = "tenant-a-user";
  const userFilters = [];
  const user = {
    _id: userId,
    tenantId,
    role: "employee",
    isActive: true,
    isPasswordCorrect: async () => true,
    save: async () => {},
  };
  t.mock.method(Tenant, "findOne", async () => ({
    _id: tenantId,
    slug: "company-a",
    status: "active",
  }));
  t.mock.method(User, "findById", () =>
    queryFor({ ...user, tenantId }),
  );
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      status: "active",
      plan: "free",
      billing: { status: "inactive" },
    }),
  );
  t.mock.method(User, "findOne", (filter) => {
    userFilters.push(filter);
    if (filter.passwordResetToken) return queryFor(null);
    if (filter._id === userId) return queryFor(user);
    return queryFor(null);
  });

  const forgotten = await request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      companySlug: "company-a",
      email: "worker@example.com",
    }),
  });
  const reset = await request("/api/auth/reset-password/raw-token", {
    method: "POST",
    body: JSON.stringify({
      companySlug: "company-a",
      password: "newPassword123",
    }),
  });
  const me = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenFor(userId, "employee")}` },
  });
  const changed = await request("/api/auth/change-password", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(userId, "employee")}` },
    body: JSON.stringify({
      currentPassword: "oldPassword123",
      newPassword: "newPassword123",
    }),
  });

  assert.equal(forgotten.status, 200);
  assert.equal(reset.status, 400);
  assert.equal(me.status, 200);
  assert.equal(changed.status, 200);
  assert.deepEqual(userFilters[0], {
    tenantId,
    email: "worker@example.com",
  });
  assert.equal(userFilters[1].tenantId, tenantId);
  assert.equal(userFilters[1].passwordResetToken.length, 64);
  assert.deepEqual(userFilters[2], { _id: userId, tenantId });
  assert.deepEqual(userFilters[3], { _id: userId, tenantId });
});

test("authentication rejects a token whose tenant differs from the user", async (t) => {
  const userId = "cross-tenant-user";
  authenticatedUserStub(
    t,
    new Map([
      [
        userId,
        {
          role: "admin",
          isActive: true,
          tenantId: "tenant-b-id",
        },
      ],
    ]),
  );

  const response = await request("/api/users/profile", {
    headers: {
      Authorization: `Bearer ${tokenFor(userId, "admin", "tenant-a-id")}`,
    },
  });

  assert.equal(response.status, 401);
});

test("manual suspension blocks access while an expired cancellation remains read-only", async (t) => {
  const tenantId = TEST_TENANT_ID;
  const userId = "active-session-user";
  const user = { _id: userId, tenantId, role: "employee", isActive: true };
  let tenant = { status: "suspended", billing: { status: "inactive" } };
  t.mock.method(User, "findById", () => queryFor(user));
  t.mock.method(User, "findOne", () =>
    queryFor({ ...user, toObject: () => ({ ...user }) }),
  );
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const headers = {
    Authorization: `Bearer ${tokenFor(userId, "employee", tenantId)}`,
  };

  const suspended = await request("/api/auth/me", { headers });
  tenant = {
    status: "active",
    plan: "basic",
    billing: {
      status: "cancelled",
      currentPeriodEnd: new Date(Date.now() - 1000),
    },
  };
  const expired = await request("/api/auth/me", { headers });

  assert.equal(suspended.status, 403);
  assert.equal(expired.status, 200);
});

test("admin and user routes cannot access another tenant's users", async (t) => {
  const adminId = "tenant-a-admin";
  const otherUserId = "tenant-b-user";
  authenticatedUserStub(
    t,
    new Map([[adminId, { role: "admin", isActive: true }]]),
  );

  const userFilters = [];
  t.mock.method(User, "findOne", (filter) => {
    userFilters.push(filter);
    return queryFor(null);
  });
  let updateCalls = 0;
  t.mock.method(User, "findOneAndUpdate", async () => {
    updateCalls++;
    return null;
  });

  const profileResponse = await request(
    `/api/users/profile?userId=${otherUserId}`,
    {
      headers: {
        Authorization: `Bearer ${tokenFor(adminId, "admin")}`,
      },
    },
  );
  assert.equal(profileResponse.status, 404);
  assert.deepEqual(userFilters[0], {
    _id: otherUserId,
    tenantId: TEST_TENANT_ID,
  });

  const statusResponse = await request("/api/admin/toggle-status", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenFor(adminId, "admin")}`,
    },
    body: JSON.stringify({ employeeId: otherUserId }),
  });
  assert.equal(statusResponse.status, 404);
  assert.deepEqual(userFilters[1], {
    _id: otherUserId,
    tenantId: TEST_TENANT_ID,
  });
  assert.equal(updateCalls, 0);

  const profileUpdateResponse = await request("/api/users/profile", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${tokenFor(adminId, "admin")}`,
    },
    body: JSON.stringify({
      userId: otherUserId,
      firstName: "Attacker",
    }),
  });
  assert.equal(profileUpdateResponse.status, 404);
  assert.deepEqual(userFilters[2], {
    _id: otherUserId,
    tenantId: TEST_TENANT_ID,
  });

  const managerResponse = await request("/api/admin/assign-manager", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenFor(adminId, "admin")}`,
    },
    body: JSON.stringify({
      employeeId: adminId,
      managerId: otherUserId,
    }),
  });
  assert.equal(managerResponse.status, 400);
  assert.deepEqual(userFilters[3], {
    _id: otherUserId,
    tenantId: TEST_TENANT_ID,
  });

  let uploadedFileFilter;
  t.mock.method(User, "exists", async (filter) => {
    uploadedFileFilter = filter;
    return false;
  });
  const fileResponse = await request(
    "/api/uploads/documents/other-tenant-file.pdf",
    {
      headers: {
        Authorization: `Bearer ${tokenFor(adminId, "admin")}`,
      },
    },
  );
  assert.equal(fileResponse.status, 404);
  assert.equal(uploadedFileFilter.tenantId, TEST_TENANT_ID);
});

test("create-staff and bulk-import are blocked at the employee limit", async (t) => {
  const adminId = "tenant-a-admin";
  const tenant = {
    _id: TEST_TENANT_ID,
    status: "active",
    plan: "free",
    employeeLimitOverride: null,
    billing: { status: "inactive" },
    leavePolicy: {},
  };
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  t.mock.method(User, "findById", (id) =>
    queryFor({
      _id: id,
      tenantId: TEST_TENANT_ID,
      role: "admin",
      isActive: true,
    }),
  );
  t.mock.method(User, "countDocuments", async () => 10);
  t.mock.method(User, "find", () => queryFor([]));
  t.mock.method(User, "findOne", () => queryFor(null));

  const headers = {
    Authorization: `Bearer ${tokenFor(adminId, "admin")}`,
  };
  const createStaff = await request("/api/admin/create-staff", {
    method: "POST",
    headers,
    body: JSON.stringify({
      employeeId: "NEW-1",
      name: "New employee",
      email: "new@example.com",
      role: "employee",
    }),
  });
  const csv = new FormData();
  csv.append(
    "file",
    new Blob(
      ["employeeId,name,email,role\nNEW-2,New employee,new2@example.com,employee"],
      { type: "text/csv" },
    ),
    "staff.csv",
  );
  const bulkImport = await request("/api/admin/bulk-import", {
    method: "POST",
    headers,
    body: csv,
  });

  assert.equal(createStaff.status, 403);
  assert.equal((await createStaff.json()).code, "PLAN_LIMIT_REACHED");
  assert.equal(bulkImport.status, 403);
  assert.equal((await bulkImport.json()).code, "PLAN_LIMIT_REACHED");
});

test("remaining admin routes scope bulk, staff, balance, leave, and password access", async (t) => {
  const adminId = "tenant-a-admin";
  const foreignUserId = "tenant-b-user";
  const tenantAUser = {
    _id: "tenant-a-existing",
    tenantId: TEST_TENANT_ID,
    employeeId: "A-1",
    email: "a@example.com",
    role: "employee",
    save: async () => {},
  };
  authenticatedUserStub(
    t,
    new Map([[adminId, { role: "admin", isActive: true }]]),
  );

  const findFilters = [];
  const findOneFilters = [];
  const findOneAndUpdateFilters = [];
  t.mock.method(User, "find", (filter) => {
    findFilters.push(filter);
    return queryFor(filter.$or ? [tenantAUser] : []);
  });
  t.mock.method(User, "findOne", (filter) => {
    findOneFilters.push(filter);
    return queryFor(null);
  });
  t.mock.method(User, "findOneAndUpdate", (filter) => {
    findOneAndUpdateFilters.push(filter);
    return queryFor(null);
  });
  t.mock.method(User, "countDocuments", async (filter) => {
    findFilters.push(filter);
    return 0;
  });
  t.mock.method(User, "updateMany", async (filter) => {
    findFilters.push(filter);
    return { modifiedCount: 0 };
  });
  t.mock.method(Leave, "find", (filter) => {
    findFilters.push(filter);
    return queryFor([]);
  });

  const csv = new FormData();
  csv.append(
    "file",
    new Blob(["employeeId,name,email,role\nA-1,Tenant A,a@example.com,employee"], {
      type: "text/csv",
    }),
    "staff.csv",
  );
  const bulkImport = await request("/api/admin/bulk-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: csv,
  });
  const createStaff = await request("/api/admin/create-staff", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({
      employeeId: "NEW-1",
      name: "New employee",
      email: "new@example.com",
      role: "employee",
      reportingManager: foreignUserId,
    }),
  });
  const staff = await request("/api/admin/staff?allowCrossTenant=true", {
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
  });
  const assignManager = await request("/api/admin/assign-manager", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({
      employeeId: "tenant-a-employee",
      managerId: foreignUserId,
    }),
  });
  const adjustBalance = await request("/api/admin/adjust-balance", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({
      employeeId: foreignUserId,
      leaveType: "casual",
      amount: 10,
    }),
  });
  const updateStaff = await request("/api/admin/update-staff", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({
      employeeId: foreignUserId,
      name: "Foreign User",
      email: "foreign@example.com",
      role: "employee",
    }),
  });
  const toggleStatus = await request("/api/admin/toggle-status", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({ employeeId: foreignUserId }),
  });
  const rollover = await request("/api/admin/trigger-year-end-rollover", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
  });
  const grantLeave = await request("/api/admin/grant-leave-all", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({
      leaveType: "casual",
      amount: 1,
      userId: foreignUserId,
      targetType: "individual",
    }),
  });
  const leaveExport = await request("/api/admin/export-leave-history", {
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
  });
  const resetPassword = await request("/api/admin/employee-reset-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({ employeeId: foreignUserId }),
  });

  assert.equal(bulkImport.status, 200);
  assert.equal(createStaff.status, 400);
  assert.equal(staff.status, 200);
  assert.equal(assignManager.status, 400);
  assert.equal(adjustBalance.status, 404);
  assert.equal(updateStaff.status, 404);
  assert.equal(toggleStatus.status, 404);
  assert.equal(rollover.status, 200);
  assert.equal(grantLeave.status, 404);
  assert.equal(leaveExport.status, 200);
  assert.equal(resetPassword.status, 404);
  assert.ok(findFilters.length > 0);
  assert.ok(
    findFilters.every((filter) => filter.tenantId === TEST_TENANT_ID),
    JSON.stringify(findFilters),
  );
  assert.ok(findOneFilters.every((filter) => filter.tenantId === TEST_TENANT_ID));
  assert.ok(findOneAndUpdateFilters.every((filter) => filter.tenantId === TEST_TENANT_ID));
});

test("all Proman proxy routes require authentication", async (t) => {
  const nativeFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.origin === baseUrl) return nativeFetch(input, options);
    outboundCalls++;
    return Response.json({ success: true });
  };

  try {
    const cases = [
      ["GET", "/api/proman/tasks"],
      ["POST", "/api/proman/timelog"],
      ["PATCH", "/api/proman/task/task-1/status"],
    ];

    for (const [method, url] of cases) {
      const response = await request(url, {
        method,
        ...(method === "GET" ? {} : { body: JSON.stringify({}) }),
      });
      assert.equal(response.status, 401, `${method} ${url}`);
    }

    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test("uploaded files are private and available only to their owner or admin", async (t) => {
  const uploadsRoot = fileURLToPath(new URL("../uploads/", import.meta.url));
  const documentsRoot = fileURLToPath(
    new URL(`../uploads/${TEST_TENANT_ID}/documents/`, import.meta.url),
  );
  const prescriptionsRoot = fileURLToPath(
    new URL(`../uploads/${TEST_TENANT_ID}/prescriptions/`, import.meta.url),
  );
  fs.mkdirSync(documentsRoot, { recursive: true });
  fs.mkdirSync(prescriptionsRoot, { recursive: true });
  const documentName = `doc-${process.pid}.txt`;
  const prescriptionName = `prescription-${process.pid}.txt`;
  const documentPath = path.join(documentsRoot, documentName);
  const prescriptionPath = path.join(prescriptionsRoot, prescriptionName);
  fs.writeFileSync(documentPath, "owned document");
  fs.writeFileSync(prescriptionPath, "owned prescription");
  t.after(() => {
    fs.rmSync(path.join(uploadsRoot, TEST_TENANT_ID), {
      recursive: true,
      force: true,
    });
  });

  const ownerId = "owner-user-id";
  const otherId = "other-user-id";
  const adminId = "admin-user-id";
  const otherTenantAdminId = "other-tenant-admin";
  const otherTenantId = "fedcba987654321001234567";
  const users = new Map([
    [ownerId, { role: "employee", isActive: true }],
    [otherId, { role: "employee", isActive: true }],
    [adminId, { role: "admin", isActive: true }],
    [
      otherTenantAdminId,
      {
        role: "admin",
        isActive: true,
        tenantId: otherTenantId,
      },
    ],
  ]);
  authenticatedUserStub(t, users);
  t.mock.method(
    User,
    "exists",
    async (filter) =>
      filter.tenantId === TEST_TENANT_ID &&
      (!filter._id || filter._id === ownerId),
  );
  t.mock.method(
    Leave,
    "exists",
    async (filter) =>
      filter.tenantId === TEST_TENANT_ID &&
      (!filter.userId || filter.userId === ownerId),
  );

  const publicFile = await request(`/uploads/documents/${documentName}`);
  assert.equal(publicFile.status, 404);

  const unauthenticated = await request(
    `/api/uploads/documents/${documentName}`,
  );
  assert.equal(unauthenticated.status, 401);

  const ownerResponse = await request(
    `/api/uploads/documents/${documentName}`,
    {
      headers: { Authorization: `Bearer ${tokenFor(ownerId, "employee")}` },
    },
  );
  assert.equal(ownerResponse.status, 200);
  assert.equal(await ownerResponse.text(), "owned document");

  const prescriptionResponse = await request(
    `/api/uploads/prescriptions/${prescriptionName}`,
    {
      headers: { Authorization: `Bearer ${tokenFor(ownerId, "employee")}` },
    },
  );
  assert.equal(prescriptionResponse.status, 200);
  assert.equal(await prescriptionResponse.text(), "owned prescription");

  const otherUserResponse = await request(
    `/api/uploads/documents/${documentName}`,
    {
      headers: { Authorization: `Bearer ${tokenFor(otherId, "employee")}` },
    },
  );
  assert.equal(otherUserResponse.status, 404);

  const adminResponse = await request(
    `/api/uploads/documents/${documentName}`,
    {
      headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    },
  );
  assert.equal(adminResponse.status, 200);

  const otherTenantAdminResponse = await request(
    `/api/uploads/documents/${documentName}`,
    {
      headers: {
        Authorization: `Bearer ${tokenFor(
          otherTenantAdminId,
          "admin",
          otherTenantId,
        )}`,
      },
    },
  );
  assert.equal(otherTenantAdminResponse.status, 404);
});

test("user document routes restrict employees to their own userId", async (t) => {
  const employeeId = "document-owner-id";
  const otherId = "document-other-id";
  const adminId = "document-admin-id";
  const otherTenantAdminId = "document-other-tenant-admin-id";
  const otherTenantId = "abcdef0123456789abcdef01";
  const documentId = "document-id";
  const otherUser = {
    role: "employee",
    isActive: true,
    documents: [],
    save: async () => {},
  };
  otherUser.documents.id = (id) =>
    otherUser.documents.find((document) => document._id === id);
  otherUser.documents.pull = (id) => {
    const index = otherUser.documents.findIndex(
      (document) => document._id === id,
    );
    if (index >= 0) otherUser.documents.splice(index, 1);
  };
  otherUser.documents.push = (document) => {
    document._id = documentId;
    Array.prototype.push.call(otherUser.documents, document);
  };
  authenticatedUserStub(
    t,
    new Map([
      [employeeId, { role: "employee", isActive: true }],
      [adminId, { role: "admin", isActive: true }],
      [
        otherTenantAdminId,
        {
          role: "admin",
          isActive: true,
          tenantId: otherTenantId,
        },
      ],
      [otherId, otherUser],
    ]),
  );
  t.mock.method(User, "findOne", (filter) =>
    queryFor(
      filter._id === otherId && filter.tenantId === TEST_TENANT_ID
        ? otherUser
        : null,
    ),
  );
  const tenantUploadsRoot = path.join(
    fileURLToPath(new URL("../uploads/", import.meta.url)),
    TEST_TENANT_ID,
  );
  t.after(() => {
    fs.rmSync(tenantUploadsRoot, { recursive: true, force: true });
  });

  const deniedUpload = await request(`/api/users/${otherId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(employeeId, "employee")}` },
  });
  assert.equal(deniedUpload.status, 403);

  const deniedDelete = await request(
    `/api/users/${otherId}/documents/document-id`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenFor(employeeId, "employee")}` },
    },
  );
  assert.equal(deniedDelete.status, 403);

  const ownUpload = await request(`/api/users/${employeeId}/documents`, {
    method: "POST",
    body: new FormData(),
    headers: { Authorization: `Bearer ${tokenFor(employeeId, "employee")}` },
  });
  assert.equal(ownUpload.status, 400, await ownUpload.text());

  const adminUpload = await request(`/api/users/${otherId}/documents`, {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      formData.append("title", "Test document");
      formData.append(
        "document",
        new Blob(["test document"], { type: "application/pdf" }),
        "test.pdf",
      );
      return formData;
    })(),
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
  });
  assert.equal(adminUpload.status, 201);
  assert.equal(otherUser.documents.length, 1);
  const uploadedDocument = otherUser.documents[0];
  assert.equal(
    uploadedDocument.path,
    `/uploads/${TEST_TENANT_ID}/documents/${uploadedDocument.fileName}`,
  );
  const filePath = path.join(
    tenantUploadsRoot,
    "documents",
    uploadedDocument.fileName,
  );
  assert.equal(fs.existsSync(filePath), true);

  const foreignTenantDelete = await request(
    `/api/users/${otherId}/documents/${documentId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenFor(
          otherTenantAdminId,
          "admin",
          otherTenantId,
        )}`,
      },
    },
  );
  assert.equal(foreignTenantDelete.status, 404);
  assert.equal(fs.existsSync(filePath), true);

  const deleteResponse = await request(
    `/api/users/${otherId}/documents/${documentId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    },
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal(fs.existsSync(filePath), false);
});

test("managers can list and review only reportee leaves; admins remain global", async (t) => {
  const managerId = "manager-user-id";
  const adminId = "admin-user-id";
  const reporteeId = "manager-reportee-id";
  const outsiderId = "not-a-reportee-id";
  const users = new Map([
    [managerId, { role: "manager", isActive: true }],
    [adminId, { role: "admin", isActive: true }],
    [
      reporteeId,
      {
        role: "employee",
        isActive: true,
        leaveBalance: {},
        save: async () => {},
      },
    ],
  ]);
  authenticatedUserStub(t, users);

  let leaveFindFilter;
  let countFilter;
  let userFindFilter;
  t.mock.method(User, "find", (filter) => {
    userFindFilter = filter;
    return queryFor([{ _id: reporteeId }]);
  });
  t.mock.method(Leave, "find", (filter) => {
    leaveFindFilter = filter;
    return queryFor([]);
  });
  t.mock.method(Leave, "countDocuments", async (filter) => {
    countFilter = filter;
    return 0;
  });

  const managerList = await request("/api/leaves/all", {
    headers: { Authorization: `Bearer ${tokenFor(managerId, "manager")}` },
  });
  assert.equal(managerList.status, 200);
  assert.deepEqual(userFindFilter, {
    tenantId: TEST_TENANT_ID,
    reportingManager: managerId,
  });
  assert.deepEqual(leaveFindFilter, {
    tenantId: TEST_TENANT_ID,
    userId: { $in: [reporteeId] },
  });
  assert.deepEqual(countFilter, leaveFindFilter);

  const adminList = await request("/api/leaves/all", {
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
  });
  assert.equal(adminList.status, 200);
  assert.deepEqual(leaveFindFilter, { tenantId: TEST_TENANT_ID });
  assert.deepEqual(countFilter, { tenantId: TEST_TENANT_ID });

  let attemptedReviewFilter;
  const leave = {
    _id: "leave-id",
    userId: reporteeId,
    leaveType: "paid",
    daysCount: 1,
    status: "pending",
    save: async () => {},
  };
  t.mock.method(Leave, "findOne", (filter) => {
    attemptedReviewFilter = filter;
    const reporteeIds = filter.userId?.$in;
    const matchesScope =
      !filter.userId || reporteeIds?.includes(leave.userId);
    const record = filter._id === leave._id && matchesScope ? leave : null;
    return queryFor(record);
  });
  t.mock.method(User, "findOne", (filter) =>
    queryFor({
      ...users.get(reporteeId),
      _id: filter._id,
      tenantId: TEST_TENANT_ID,
    }),
  );

  const unauthorizedReview = await request(
    `/api/leaves/${outsiderId}/review`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenFor(managerId, "manager")}` },
      body: JSON.stringify({ status: "approved" }),
    },
  );
  assert.equal(unauthorizedReview.status, 404);
  assert.deepEqual(attemptedReviewFilter, {
    _id: outsiderId,
    tenantId: TEST_TENANT_ID,
    userId: { $in: [reporteeId] },
  });

  const allowedReview = await request("/api/leaves/leave-id/review", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(managerId, "manager")}` },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(allowedReview.status, 200);
  assert.equal(leave.status, "approved");

  leave.status = "pending";
  const adminReview = await request("/api/leaves/leave-id/review", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenFor(adminId, "admin")}` },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(adminReview.status, 200);
});
