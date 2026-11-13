import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const SUPER_SECRET = "tenant-requests-super-secret";
process.env.SUPER_JWT_SECRET = SUPER_SECRET;
process.env.SUPER_JWT_EXPIRES_IN = "1h";
process.env.JWT_SECRET = "tenant-requests-tenant-secret";
process.env.TENANT_SIGNUP_MODE = "approval";

const [
  { default: app },
  { default: Tenant },
  { default: TenantRequest },
  { User },
  { default: SuperAdmin },
  { default: SuperAdminAuditLog },
  { default: Notification },
  { emailTransport },
  { ENV },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/Tenant.js"),
  import("../src/models/TenantRequest.js"),
  import("../src/models/User.js"),
  import("../src/models/SuperAdmin.js"),
  import("../src/models/SuperAdminAuditLog.js"),
  import("../src/models/Notification.js"),
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
  session() {
    return this;
  },
  where() {
    return this;
  },
  withTransaction(callback) {
    return callback();
  },
  endSession() {
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
  ENV.SUPER_ADMIN_NOTIFY_EMAIL = "platform@example.com";
  ENV.TELEGRAM_BOT_TOKEN = undefined;
  ENV.TELEGRAM_CHAT_ID = undefined;
  const notificationCreate = t.mock.method(
    Notification,
    "create",
    async (data) => data,
  );
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
  assert.equal(sendMail.mock.callCount(), 3);
  assert.equal(
    sendMail.mock.calls[2].arguments[0].to,
    ENV.SUPER_ADMIN_NOTIFY_EMAIL,
  );
  assert.equal(notificationCreate.mock.callCount(), 1);
  assert.equal(notificationCreate.mock.calls[0].arguments[0].type, "tenant_request");
  assert.match(
    notificationCreate.mock.calls[0].arguments[0].link,
    new RegExp(`/super-admin/requests/${created._id}$`),
  );
});

test("auto mode creates a trial tenant and admin after email verification", async (t) => {
  ENV.TENANT_SIGNUP_MODE = "auto";
  ENV.SUPER_ADMIN_NOTIFY_EMAIL = "platform@example.com";
  ENV.TELEGRAM_BOT_TOKEN = undefined;
  ENV.TELEGRAM_CHAT_ID = undefined;
  const notificationCreate = t.mock.method(
    Notification,
    "create",
    async (data) => data,
  );
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
  assert.equal(adminData.mustChangePassword, true);
  assert.equal(requestUpdate.update.$set.tenantId, tenantId);
  assert.equal(requestUpdate.update.$set.status, "approved");
  assert.equal(sendMail.mock.callCount(), 2);
  assert.match(sendMail.mock.calls[0].arguments[0].html, /Temporary Password/);
  assert.equal(sendMail.mock.calls[1].arguments[0].to, ENV.SUPER_ADMIN_NOTIFY_EMAIL);
  assert.equal(notificationCreate.mock.callCount(), 2);
  assert.deepEqual(
    notificationCreate.mock.calls.map((call) => call.arguments[0].type),
    ["tenant_request", "tenant_signup"],
  );
});

test("Super Admin can list requests and atomically approve one", async (t) => {
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
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: superAdminId, name: "Platform Admin" }),
  );
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

  const listResponse = await request("/api/super/requests?status=pending", {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const listBody = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.deepEqual(listFilter, { status: "pending", emailVerified: true });
  assert.equal(listBody.data.requests.length, 1);

  t.mock.method(TenantRequest, "findOne", () => queryFor(tenantRequest));
  t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  }));
  t.mock.method(Tenant, "create", async ([data]) => [
    { ...data, _id: tenantId },
  ]);
  t.mock.method(User, "create", async ([data]) => [
    { ...data, _id: adminId },
  ]);
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
    `/api/super/requests/${requestId}/approve`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ plan: "basic", employeeLimit: 35, trialDays: 21 }),
    },
  );
  const approveBody = await approveResponse.json();

  assert.equal(approveResponse.status, 200, JSON.stringify(approveBody));
  assert.equal(approveBody.data.status, "approved");
  assert.equal(requestUpdate.mock.calls[0].arguments[1].$set.reviewedBy, superAdminId);
  assert.equal(requestUpdate.mock.calls[0].arguments[1].$set.tenantId, tenantId);
  assert.equal(Tenant.create.mock.calls[0].arguments[0][0].plan, "basic");
  assert.equal(Tenant.create.mock.calls[0].arguments[0][0].employeeLimitOverride, 35);
  assert.equal(User.create.mock.calls[0].arguments[0][0].mustChangePassword, true);
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
  let update;
  t.mock.method(TenantRequest, "findOneAndUpdate", async (_filter, updateValue) => {
    update = updateValue;
    return { ...tenantRequest, status: "rejected" };
  });
  t.mock.method(SuperAdminAuditLog, "create", async () => ({ _id: "audit-reject" }));
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));

  const response = await request(
    `/api/super/requests/${requestId}/reject`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ reason: "Please contact the sales team first." }),
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

test("Super Admin notifications can be listed and marked read", async (t) => {
  const superAdminId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  const notification = {
    _id: notificationId,
    type: "tenant_request",
    title: "New request",
    message: "A verified request arrived.",
    link: "/super-admin/requests/123",
    isRead: false,
    createdAt: new Date(),
  };
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: superAdminId, name: "Platform Admin" }),
  );
  t.mock.method(SuperAdminAuditLog, "create", async () => ({ _id: "audit" }));
  t.mock.method(Notification, "find", () => queryFor([notification]));
  t.mock.method(Notification, "countDocuments", async () => 1);
  const listResponse = await request("/api/super/notifications", {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const listBody = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listBody.data.unreadCount, 1);
  assert.equal(listBody.data.notifications[0].title, "New request");

  let readFilter;
  t.mock.method(Notification, "findOneAndUpdate", (filter) => {
    readFilter = filter;
    return queryFor({ ...notification, isRead: true });
  });
  const readResponse = await request(
    `/api/super/notifications/${notificationId}/read`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${superToken}` },
    },
  );
  assert.equal(readResponse.status, 200);
  assert.equal(readFilter._id, notificationId.toString());

  let readAllFilter;
  t.mock.method(Notification, "updateMany", async (filter) => {
    readAllFilter = filter;
    return { modifiedCount: 2 };
  });
  const readAllResponse = await request("/api/super/notifications/read-all", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const readAllBody = await readAllResponse.json();
  assert.equal(readAllResponse.status, 200);
  assert.equal(readAllBody.data.modifiedCount, 2);
  assert.equal(readAllFilter.isRead, false);
});

test("cannot approve a tenant request twice", async (t) => {
  const superAdminId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const requestDoc = {
    _id: requestId,
    companyName: "One-time Company",
    slug: "one-time-company",
    contactName: "One-time Contact",
    email: "one-time@example.com",
    status: "pending",
    emailVerified: true,
  };
  let status = "pending";
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: superAdminId, name: "Platform Admin" }),
  );
  t.mock.method(SuperAdminAuditLog, "create", async () => ({ _id: "audit" }));
  t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  }));
  t.mock.method(TenantRequest, "findOne", () =>
    queryFor(status === "pending" ? requestDoc : null),
  );
  t.mock.method(Tenant, "create", async ([data]) => [
    { ...data, _id: tenantId },
  ]);
  t.mock.method(User, "create", async ([data]) => [{ ...data, _id: "admin" }]);
  t.mock.method(TenantRequest, "updateOne", async () => {
    status = "approved";
    return { modifiedCount: 1 };
  });
  t.mock.method(SuperAdminAuditLog, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(emailTransport, "sendMail", async () => ({}));

  const endpoint = `/api/super/requests/${requestId}/approve`;
  const first = await request(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${superToken}` },
    body: JSON.stringify({}),
  });
  const second = await request(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${superToken}` },
    body: JSON.stringify({}),
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.equal(Tenant.create.mock.callCount(), 1);
});

test("duplicate tenant slug is rejected during transactional approval", async (t) => {
  const superAdminId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();
  const requestDoc = {
    _id: requestId,
    companyName: "Duplicate Company",
    slug: "duplicate-company",
    contactName: "Duplicate Contact",
    email: "duplicate@example.com",
    status: "pending",
    emailVerified: true,
  };
  t.mock.method(SuperAdmin, "findById", () =>
    queryFor({ _id: superAdminId, name: "Platform Admin" }),
  );
  t.mock.method(SuperAdminAuditLog, "create", async () => ({ _id: "audit" }));
  t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  }));
  t.mock.method(TenantRequest, "findOne", () => queryFor(requestDoc));
  const tenantCreate = t.mock.method(Tenant, "create", async () => {
    const error = new Error("duplicate slug");
    error.code = 11000;
    throw error;
  });
  t.mock.method(User, "create", async () => {
    throw new Error("the admin must not be created");
  });
  const requestUpdate = t.mock.method(TenantRequest, "updateOne", async () => ({
    modifiedCount: 1,
  }));

  const response = await request(
    `/api/super/requests/${requestId}/approve`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({}),
    },
  );

  assert.equal(response.status, 409);
  assert.equal(tenantCreate.mock.callCount(), 1);
  assert.equal(requestUpdate.mock.callCount(), 0);
});

test("tenant tokens cannot access Super Admin requests", async () => {
  const tenantToken = jwt.sign(
    {
      id: new mongoose.Types.ObjectId().toString(),
      tenantId: new mongoose.Types.ObjectId().toString(),
      role: "admin",
    },
    process.env.JWT_SECRET,
  );
  const response = await request("/api/super/requests", {
    headers: { Authorization: `Bearer ${tenantToken}` },
  });
  assert.equal(response.status, 401);
});

test("temporary tenant passwords block protected routes until changed", async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  t.mock.method(User, "findById", () =>
    queryFor({
      _id: userId,
      tenantId,
      role: "admin",
      isActive: true,
      mustChangePassword: true,
    }),
  );
  t.mock.method(Tenant, "findById", () =>
    queryFor({ _id: tenantId, status: "trial", plan: "free" }),
  );
  const tenantToken = jwt.sign(
    { id: userId.toString(), tenantId: tenantId.toString(), role: "admin" },
    process.env.JWT_SECRET,
  );

  const response = await request("/api/users/profile", {
    headers: { Authorization: `Bearer ${tenantToken}` },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "PASSWORD_CHANGE_REQUIRED");
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
