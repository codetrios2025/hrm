import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const SUPER_SECRET = "tenant-requests-super-secret";
process.env.SUPER_JWT_SECRET = SUPER_SECRET;
process.env.SUPER_JWT_EXPIRES_IN = "1h";
process.env.TENANT_SIGNUP_MODE = "approval";

const [
  { default: app },
  { default: Tenant },
  { default: TenantRequest },
  { User },
  { default: SuperAdmin },
  { default: SuperAdminAuditLog },
  { emailTransport },
  { ENV },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/Tenant.js"),
  import("../src/models/TenantRequest.js"),
  import("../src/models/User.js"),
  import("../src/models/SuperAdmin.js"),
  import("../src/models/SuperAdminAuditLog.js"),
  import("../src/utils/email.js"),
  import("../src/config/env.js"),
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
  sort() {
    return this;
  },
  skip() {
    return this;
  },
  limit() {
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

const formData = (suffix = "test") => ({
  companyName: "Request Company",
  slug: `request-${suffix}`,
  contactName: "Contact Person",
  email: `contact-${suffix}@example.com`,
  phone: "+1-555-555-0100",
  employeeCountEstimate: 24,
  message: "We would like to try oliveHRM.",
  website: "",
});

const verificationTokenFrom = (mail) =>
  mail.html.match(/signup-request\/verify\?token=([a-f0-9]{64})/)?.[1];

const superToken = jwt.sign(
  { id: "super-admin-id", type: "super" },
  SUPER_SECRET,
);

test("TenantRequest has unique pending email and slug indexes", () => {
  const indexes = TenantRequest.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.email === 1 &&
        options.unique === true &&
        options.partialFilterExpression.status === "pending",
    ),
  );
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.slug === 1 &&
        options.unique === true &&
        options.partialFilterExpression.status === "pending",
    ),
  );
  assert.deepEqual(TenantRequest.schema.path("status").enumValues, [
    "pending",
    "approved",
    "rejected",
  ]);
});

test("slug-available accounts for pending requests and reserved words", async (t) => {
  t.mock.method(Tenant, "exists", async () => null);
  const requestLookup = t.mock.method(
    TenantRequest,
    "exists",
    async (filter) => filter.slug === "reserved-for-request",
  );

  const pending = await request(
    "/api/public/slug-available?slug=reserved-for-request",
  );
  const reserved = await request("/api/public/slug-available?slug=admin");

  assert.equal((await pending.json()).data.available, false);
  assert.equal((await reserved.json()).data.available, false);
  assert.equal(requestLookup.mock.callCount(), 1);
});

test("signup request emails verification first and only exposes verified requests", async (t) => {
  ENV.TENANT_SIGNUP_MODE = "approval";
  t.mock.method(Tenant, "exists", async () => null);
  t.mock.method(TenantRequest, "exists", async () => null);
  let created;
  t.mock.method(TenantRequest, "create", async (data) => {
    created = { ...data, _id: new mongoose.Types.ObjectId() };
    return created;
  });
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));

  const submitResponse = await request("/api/public/signup-request", {
    method: "POST",
    body: JSON.stringify(formData("approval")),
  });
  const submitBody = await submitResponse.json();

  assert.equal(submitResponse.status, 201);
  assert.equal(submitBody.data.mode, "approval");
  assert.equal(created.emailVerified, false);
  assert.equal(created.status, "pending");
  assert.match(created.emailVerificationToken, /^[a-f0-9]{64}$/);
  assert.equal(sendMail.mock.callCount(), 2);
  assert.equal(sendMail.mock.calls[0].arguments[0].subject, "Verify your oliveHRM tenant request");
  assert.equal(sendMail.mock.calls[1].arguments[0].subject, "We received your oliveHRM request");

  const token = verificationTokenFrom(sendMail.mock.calls[0].arguments[0]);
  assert.ok(token);
  let verificationFilter;
  let update;
  const verifiedRequest = {
    ...created,
    emailVerificationToken: crypto
      .createHash("sha256")
      .update(token)
      .digest("hex"),
    emailVerificationExpires: new Date(Date.now() + 60_000),
  };
  t.mock.method(TenantRequest, "findOne", (filter) => {
    verificationFilter = filter;
    return queryFor(verifiedRequest);
  });
  t.mock.method(TenantRequest, "updateOne", async (filter, updateValue) => {
    update = { filter, value: updateValue };
    return { modifiedCount: 1 };
  });

  const verifyResponse = await request(
    `/api/public/signup-request/verify?token=${token}`,
  );
  const verifyBody = await verifyResponse.json();

  assert.equal(verifyResponse.status, 200);
  assert.equal(verifyBody.data.mode, "approval");
  assert.equal(verifyBody.data.status, "pending");
  assert.equal(verificationFilter.emailVerified, false);
  assert.equal(verificationFilter.emailVerificationToken, verifiedRequest.emailVerificationToken);
  assert.deepEqual(update.value.$set, { emailVerified: true });
  assert.equal(update.value.$unset.emailVerificationToken, 1);
});

test("auto mode creates a trial tenant and admin after email verification", async (t) => {
  ENV.TENANT_SIGNUP_MODE = "auto";
  const tenantId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const token = "ab".repeat(32);
  const requestDoc = {
    _id: new mongoose.Types.ObjectId(),
    companyName: "Auto Company",
    slug: "auto-company",
    contactName: "Auto Admin",
    email: "auto@example.com",
    status: "pending",
    emailVerified: false,
    emailVerificationToken: crypto
      .createHash("sha256")
      .update(token)
      .digest("hex"),
    emailVerificationExpires: new Date(Date.now() + 60_000),
  };
  t.mock.method(TenantRequest, "findOne", () => queryFor(requestDoc));
  t.mock.method(mongoose, "startSession", async () => {
    const error = new Error("Transactions require a replica set");
    error.code = 20;
    throw error;
  });
  let tenantData;
  t.mock.method(Tenant, "create", async (data) => {
    tenantData = data;
    return { ...data, _id: tenantId };
  });
  let adminData;
  t.mock.method(User, "create", async (data) => {
    adminData = data;
    return { ...data, _id: adminId };
  });
  let requestUpdate;
  t.mock.method(TenantRequest, "updateOne", async (filter, update) => {
    requestUpdate = { filter, update };
    return { modifiedCount: 1 };
  });
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));

  const response = await request(
    `/api/public/signup-request/verify?token=${token}`,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.mode, "auto");
  assert.equal(body.data.status, "approved");
  assert.equal(tenantData.status, "trial");
  assert.equal(tenantData.plan, "free");
  assert.ok(tenantData.trialEndsAt.getTime() > Date.now());
  assert.ok(
    tenantData.trialEndsAt.getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000,
  );
  assert.equal(adminData.tenantId, tenantId);
  assert.equal(adminData.role, "admin");
  assert.equal(adminData.emailVerified, true);
  assert.equal(requestUpdate.update.$set.tenantId, tenantId);
  assert.equal(requestUpdate.update.$set.status, "approved");
  assert.equal(sendMail.mock.callCount(), 1);
  assert.match(sendMail.mock.calls[0].arguments[0].html, /Temporary Password/);
});

test("Super Admin sees only verified pending requests and can approve them", async (t) => {
  ENV.TENANT_SIGNUP_MODE = "approval";
  const superAdminId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: superAdminId, name: "Platform Admin" }),
  );
  const tenantRequest = {
    _id: requestId,
    companyName: "Approved Company",
    slug: "approved-company",
    contactName: "Approved Contact",
    email: "approved@example.com",
    phone: "+1-555-555-0101",
    employeeCountEstimate: 8,
    emailVerified: true,
    status: "pending",
  };
  let listFilter;
  t.mock.method(TenantRequest, "find", (filter) => {
    listFilter = filter;
    return queryFor([tenantRequest]);
  });
  t.mock.method(TenantRequest, "countDocuments", async () => 1);
  const auditCreate = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({ _id: "audit-request" }),
  );

  const listResponse = await request("/api/super/tenant-requests", {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const listBody = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.deepEqual(listFilter, { status: "pending", emailVerified: true });
  assert.equal(listBody.data.requests.length, 1);
  t.mock.method(TenantRequest, "findOne", () => queryFor(tenantRequest));

  t.mock.method(Tenant, "exists", async () => null);
  t.mock.method(mongoose, "startSession", async () => {
    const error = new Error("Transactions require a replica set");
    error.code = 20;
    throw error;
  });
  t.mock.method(Tenant, "create", async (data) => ({ ...data, _id: tenantId }));
  t.mock.method(User, "create", async (data) => ({ ...data, _id: adminId }));
  const requestUpdate = t.mock.method(
    TenantRequest,
    "updateOne",
    async () => ({ modifiedCount: 1 }),
  );
  const auditUpdate = t.mock.method(
    SuperAdminAuditLog,
    "updateOne",
    async () => ({ modifiedCount: 1 }),
  );
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));

  const approveResponse = await request(
    `/api/super/tenant-requests/${requestId}/review`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ status: "approved" }),
    },
  );
  const approveBody = await approveResponse.json();

  assert.equal(approveResponse.status, 200, JSON.stringify(approveBody));
  assert.equal(approveBody.data.status, "approved");
  assert.equal(requestUpdate.mock.calls[0].arguments[1].$set.reviewedBy, superAdminId);
  assert.equal(requestUpdate.mock.calls[0].arguments[1].$set.tenantId, tenantId);
  assert.equal(sendMail.mock.callCount(), 1);
  assert.equal(auditCreate.mock.callCount(), 2);
  assert.equal(auditUpdate.mock.callCount(), 1);
});

test("Super Admin rejection records a reason and emails the applicant", async (t) => {
  const superAdminId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();
  const tenantRequest = {
    _id: requestId,
    contactName: "Request Contact",
    email: "request@example.com",
    status: "pending",
    emailVerified: true,
  };
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: superAdminId, name: "Platform Admin" }),
  );
  t.mock.method(TenantRequest, "findOne", () => queryFor(tenantRequest));
  let update;
  t.mock.method(TenantRequest, "updateOne", async (_filter, updateValue) => {
    update = updateValue;
    return { modifiedCount: 1 };
  });
  t.mock.method(SuperAdminAuditLog, "create", async () => ({ _id: "audit-reject" }));
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));

  const response = await request(
    `/api/super/tenant-requests/${requestId}/review`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({
        status: "rejected",
        rejectionReason: "Please contact the sales team first.",
      }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "rejected");
  assert.equal(update.$set.status, "rejected");
  assert.equal(update.$set.reviewedBy, superAdminId);
  assert.equal(update.$set.rejectionReason, "Please contact the sales team first.");
  assert.equal(sendMail.mock.callCount(), 1);
  assert.match(sendMail.mock.calls[0].arguments[0].html, /Please contact the sales team first/);
});

test("signup request honeypot blocks submissions before persistence", async (t) => {
  const create = t.mock.method(TenantRequest, "create", async () => {
    throw new Error("honeypot submission must not be stored");
  });
  const response = await request("/api/public/signup-request", {
    method: "POST",
    body: JSON.stringify({ ...formData("honeypot"), website: "spam" }),
  });
  assert.equal(response.status, 400);
  assert.equal(create.mock.callCount(), 0);
});
