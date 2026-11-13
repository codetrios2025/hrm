import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import crypto from "crypto";

const TEST_SECRET = "public-signup-tests-only";
process.env.JWT_SECRET = TEST_SECRET;
process.env.JWT_EXPIRES_IN = "1h";

const [
  { default: app },
  { default: Tenant },
  { default: TenantRequest },
  { User },
  { isValidTenantSlug },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/Tenant.js"),
  import("../src/models/TenantRequest.js"),
  import("../src/models/User.js"),
  import("../src/config/slugPolicy.js"),
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
    return Promise.resolve(value);
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

const signupData = (suffix = "test") => ({
  companyName: "Example Company",
  slug: `example-${suffix}`,
  adminName: "Admin User",
  adminEmail: `admin-${suffix}@example.com`,
  password: "secure-password-123",
});

test("company code policy accepts valid slugs and blocks reserved or malformed ones", () => {
  assert.equal(isValidTenantSlug("a1-company"), true);
  for (const slug of ["admin", "api", "super", "www", "-company", "company-"]) {
    assert.equal(isValidTenantSlug(slug), false);
  }
});

test("slug availability API reports valid slugs and rejects reserved names", async (t) => {
  const exists = t.mock.method(Tenant, "exists", async () => null);
  t.mock.method(TenantRequest, "exists", async () => null);
  const available = await request("/api/public/slug-availability?slug=acme");
  const reserved = await request("/api/public/slug-availability?slug=admin");

  assert.equal(available.status, 200);
  assert.equal((await available.json()).data.available, true);
  assert.equal(reserved.status, 200);
  assert.equal((await reserved.json()).data.available, false);
  assert.equal(exists.mock.callCount(), 1);
});

test("legacy direct workspace signup is disabled in favor of signup requests", async (t) => {
  const tenantCreate = t.mock.method(Tenant, "create", async () => {
    throw new Error("direct signup must not create tenants");
  });
  const userCreate = t.mock.method(User, "create", async () => {
    throw new Error("direct signup must not create users");
  });
  const response = await request("/api/public/signup", {
    method: "POST",
    body: JSON.stringify(signupData("success")),
  });
  const body = await response.json();

  assert.equal(response.status, 410);
  assert.match(body.message, /tenant request/i);
  assert.equal(tenantCreate.mock.callCount(), 0);
  assert.equal(userCreate.mock.callCount(), 0);
});

test("email verification consumes the hashed token and marks the account verified", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const token = "ab".repeat(32);
  const user = {
    emailVerified: false,
    emailVerificationToken: crypto
      .createHash("sha256")
      .update(token)
      .digest("hex"),
    emailVerificationExpires: new Date(Date.now() + 60_000),
    save: async () => {},
  };
  const hashedToken = user.emailVerificationToken;
  let tenantFilter;
  let userFilter;
  t.mock.method(Tenant, "findOne", (filter) => {
    tenantFilter = filter;
    return queryFor({ _id: tenantId });
  });
  t.mock.method(User, "findOne", (filter) => {
    userFilter = filter;
    return queryFor(user);
  });

  const response = await request("/api/public/verify-email", {
    method: "POST",
    body: JSON.stringify({ companySlug: "acme", token }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(tenantFilter, { slug: "acme" });
  assert.equal(userFilter.tenantId, tenantId);
  assert.equal(userFilter.emailVerificationToken, hashedToken);
  assert.equal(user.emailVerified, true);
  assert.equal(user.emailVerificationToken, null);
  assert.equal(body.data.emailVerified, true);
});

test("onboarding is admin-only and persists tenant-scoped progress", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  let actor = { _id: adminId, tenantId, role: "admin", isActive: true };
  const currentTenant = {
    _id: tenantId,
    name: "Example",
    companyProfile: {},
    leavePolicy: {},
    onboarding: { completed: false, step: 1 },
  };
  const updateFilters = [];
  const updatePayloads = [];
  t.mock.method(User, "findById", () => queryFor(actor));
  t.mock.method(Tenant, "findById", () =>
    queryFor({
      status: "active",
      plan: "free",
      employeeLimitOverride: null,
      billing: { status: "inactive" },
      ...currentTenant,
    }),
  );
  t.mock.method(Tenant, "findByIdAndUpdate", (filter, update) => {
    updateFilters.push(filter);
    updatePayloads.push(update);
    return queryFor({ ...currentTenant, ...update.$set });
  });

  const token = () =>
    jwt.sign(
      { id: actor._id, role: actor.role, tenantId },
      TEST_SECRET,
    );
  const adminResponse = await request("/api/onboarding", {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const saveResponse = await request("/api/onboarding", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ name: "Example Updated", step: 2 }),
  });

  actor = { _id: employeeId, tenantId, role: "employee", isActive: true };
  const employeeResponse = await request("/api/onboarding", {
    headers: { Authorization: `Bearer ${token()}` },
  });

  assert.equal(adminResponse.status, 200);
  assert.equal(saveResponse.status, 200);
  assert.equal(employeeResponse.status, 403);
  assert.equal(String(updateFilters[0]), String(tenantId));
  assert.deepEqual(updatePayloads[0].$set, {
    name: "Example Updated",
    "onboarding.step": 2,
  });
});

test("admin usage reports active employee seats against the effective limit", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const tenant = {
    _id: tenantId,
    status: "active",
    plan: "basic",
    employeeLimitOverride: 37,
    trialEndsAt: null,
    billing: { status: "inactive" },
  };
  let countFilter;
  t.mock.method(User, "findById", () =>
    queryFor({ _id: userId, tenantId, role: "admin", isActive: true }),
  );
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  t.mock.method(User, "countDocuments", async (filter) => {
    countFilter = filter;
    return 12;
  });

  const response = await request("/api/admin/usage", {
    headers: {
      Authorization: `Bearer ${jwt.sign(
        { id: userId, role: "admin", tenantId },
        TEST_SECRET,
      )}`,
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, {
    employeeCount: 12,
    plan: "basic",
    planLabel: "Basic",
    modules: [
      "employeeManagement",
      "attendance",
      "leaveManagement",
      "holidays",
      "outdoorDuty",
    ],
    planEmployeeLimit: 50,
    employeeLimitOverride: 37,
    effectiveEmployeeLimit: 37,
    trialEndsAt: null,
    trialDaysLeft: null,
    tenantStatus: "active",
    billingStatus: "inactive",
  });
  assert.deepEqual(countFilter, {
    tenantId,
    role: { $ne: "admin" },
    isActive: { $ne: false },
  });
});

test("signup route rate-limits repeated attempts", async () => {
  const results = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    results.push(
      await request("/api/public/signup", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  }
  assert.equal(results.at(-1).status, 429);
});
