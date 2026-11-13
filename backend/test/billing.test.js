import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const TENANT_SECRET = "billing-tenant-tests-only";
const WEBHOOK_SECRET = "razorpay-test-webhook-secret";
process.env.JWT_SECRET = TENANT_SECRET;
process.env.JWT_EXPIRES_IN = "1h";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.RAZORPAY_KEY_ID = "rzp_test_example";
process.env.RAZORPAY_KEY_SECRET = "razorpay-test-secret";
process.env.RAZORPAY_PLAN_ID_FREE = "plan_free_test";
process.env.RAZORPAY_PLAN_ID_BASIC = "plan_basic_test";
process.env.RAZORPAY_PLAN_ID_PRO = "plan_pro_test";

const [
  { default: app },
  { default: Tenant },
  { User },
  { default: Payment },
  { default: ProcessedWebhookEvent },
  { default: SuperAdminAuditLog },
  { suspendExpiredBillingGrace },
  { getTenantId },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/Tenant.js"),
  import("../src/models/User.js"),
  import("../src/models/Payment.js"),
  import("../src/models/ProcessedWebhookEvent.js"),
  import("../src/models/SuperAdminAuditLog.js"),
  import("../src/jobs/billingGrace.cron.js"),
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
    return Promise.resolve(value);
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const signedRequest = async (event, eventId, overrides = {}) => {
  const rawBody = JSON.stringify(event);
  const signature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": signature,
      ...overrides,
    },
    body: rawBody,
  });
};

const subscriptionEvent = ({
  event = "subscription.updated",
  createdAt = Math.floor(Date.now() / 1000),
  subscriptionId = "sub_test_123",
  planId = "plan_pro_test",
  currentEnd = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  notes = { tenantId: "tenant-123", plan: "free" },
  payment,
} = {}) => ({
  event,
  created_at: createdAt,
  payload: {
    subscription: {
      entity: {
        id: subscriptionId,
        plan_id: planId,
        current_end: currentEnd,
        notes,
      },
    },
    ...(payment ? { payment: { entity: payment } } : {}),
  },
});

test("processed webhook events expire after 30 days", () => {
  assert.ok(
    ProcessedWebhookEvent.schema.indexes().some(
      ([keys, options]) =>
        keys.expiresAt === 1 && options.expireAfterSeconds === 0,
    ),
  );
  assert.ok(
    Tenant.schema.indexes().some(
      ([keys, options]) =>
        keys["billing.razorpaySubscriptionId"] === 1 &&
        options.unique === true &&
        options.partialFilterExpression?.["billing.razorpaySubscriptionId"]
          ?.$type === "string",
    ),
  );
});

test("invalid Razorpay signatures return 400 without writes", async (t) => {
  const create = t.mock.method(ProcessedWebhookEvent, "create", async () => ({}));
  const body = JSON.stringify(subscriptionEvent());
  const response = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-event-id": "bad-signature-event",
      "x-razorpay-signature": "invalid",
    },
    body,
  });

  assert.equal(response.status, 400);
  assert.equal(create.mock.callCount(), 0);
});

test("updated events map Razorpay plan IDs and clear overrides only on a plan change", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const tenant = {
    _id: tenantId,
    status: "active",
    plan: "basic",
    employeeLimitOverride: 30,
    billing: {
      razorpaySubscriptionId: "sub_test_123",
      status: "active",
      lastProcessedAt: null,
    },
  };
  t.mock.method(Tenant, "findOne", () => queryFor(tenant));
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const updates = [];
  t.mock.method(Tenant, "findOneAndUpdate", (filter, update) => {
    updates.push({ filter, update });
    return queryFor({ ...tenant, ...update.$set });
  });
  t.mock.method(ProcessedWebhookEvent, "create", async () => ({}));
  t.mock.method(SuperAdminAuditLog, "create", async () => ({}));

  const response = await signedRequest(
    subscriptionEvent({ notes: { tenantId: tenantId.toString(), plan: "free" } }),
    "event-plan-change",
  );

  assert.equal(response.status, 200);
  assert.equal(String(updates[0].filter._id), tenantId.toString());
  assert.equal(updates[0].update.$set.plan, "pro");
  assert.equal(updates[0].update.$set.employeeLimitOverride, null);
});

test("charged events record payments and mismatched tenant notes are ignored", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const tenant = {
    _id: tenantId,
    status: "active",
    plan: "basic",
    employeeLimitOverride: 45,
    billing: {
      razorpaySubscriptionId: "sub_test_123",
      status: "active",
      lastProcessedAt: null,
    },
  };
  t.mock.method(Tenant, "findOne", () => queryFor(tenant));
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const updates = [];
  t.mock.method(Tenant, "findOneAndUpdate", (filter, update) => {
    updates.push({ filter, update });
    return queryFor(tenant);
  });
  t.mock.method(ProcessedWebhookEvent, "create", async () => ({}));
  const paymentUpdate = t.mock.method(Payment, "updateOne", async () => ({}));
  t.mock.method(SuperAdminAuditLog, "create", async () => ({}));

  const payment = {
    id: "pay_test_123",
    invoice_id: "inv_test_123",
    amount: 50000,
    currency: "INR",
    status: "captured",
    created_at: Math.floor(Date.now() / 1000),
  };
  const charged = await signedRequest(
    subscriptionEvent({
      event: "subscription.charged",
      planId: "plan_basic_test",
      notes: { tenantId: tenantId.toString() },
      payment,
    }),
    "event-charged",
  );

  assert.equal(charged.status, 200);
  assert.deepEqual(paymentUpdate.mock.calls[0].arguments[0], {
    tenantId,
    razorpayPaymentId: "pay_test_123",
  });
  assert.equal(
    paymentUpdate.mock.calls[0].arguments[1].$setOnInsert.amount,
    50000,
  );
  assert.equal(updates[0].update.$set.employeeLimitOverride, undefined);

  const beforeMismatch = updates.length;
  const mismatch = await signedRequest(
    subscriptionEvent({
      notes: { tenantId: new mongoose.Types.ObjectId().toString() },
    }),
    "event-mismatched-tenant",
  );
  assert.equal(mismatch.status, 200);
  assert.equal(updates.length, beforeMismatch);
});

test("activation, halt, and cancellation apply the billing lifecycle", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const tenant = {
    _id: tenantId,
    status: "trial",
    plan: "free",
    employeeLimitOverride: 12,
    billing: {
      razorpaySubscriptionId: "sub_test_123",
      status: "pending",
      lastProcessedAt: null,
    },
  };
  t.mock.method(Tenant, "findOne", () => queryFor(tenant));
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const updates = [];
  t.mock.method(Tenant, "findOneAndUpdate", (filter, update) => {
    updates.push(update.$set);
    return queryFor(tenant);
  });
  t.mock.method(ProcessedWebhookEvent, "create", async () => ({}));
  const audits = t.mock.method(
    SuperAdminAuditLog,
    "create",
    async () => ({}),
  );
  const start = Math.floor(Date.now() / 1000);
  const notes = { tenantId: tenantId.toString(), plan: "free" };

  const activated = await signedRequest(
    subscriptionEvent({
      event: "subscription.activated",
      createdAt: start,
      planId: "plan_basic_test",
      notes,
    }),
    "event-activated",
  );
  const halted = await signedRequest(
    subscriptionEvent({
      event: "subscription.halted",
      createdAt: start + 1,
      planId: "plan_basic_test",
      notes,
    }),
    "event-halted",
  );
  const cancelled = await signedRequest(
    subscriptionEvent({
      event: "subscription.cancelled",
      createdAt: start + 2,
      planId: "plan_basic_test",
      currentEnd: start + 86400,
      notes,
    }),
    "event-cancelled",
  );

  assert.equal(activated.status, 200);
  assert.equal(halted.status, 200);
  assert.equal(cancelled.status, 200);
  assert.equal(updates[0].status, "active");
  assert.equal(updates[0].plan, "basic");
  assert.equal(updates[0].employeeLimitOverride, null);
  assert.equal(updates[1]["billing.status"], "halted");
  assert.equal(
    updates[1]["billing.graceUntil"].getTime(),
    (start + 1 + 7 * 24 * 60 * 60) * 1000,
  );
  assert.equal(updates[2]["billing.status"], "cancelled");
  assert.equal(
    updates[2]["billing.currentPeriodEnd"].getTime(),
    (start + 86400) * 1000,
  );
  assert.equal(audits.mock.calls[0].arguments[0].source, "razorpay-webhook");
});

test("duplicate webhook events are idempotent", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const tenant = {
    _id: tenantId,
    status: "active",
    plan: "basic",
    billing: {
      razorpaySubscriptionId: "sub_test_123",
      lastProcessedAt: null,
    },
  };
  const create = t.mock.method(ProcessedWebhookEvent, "create", async () => {
    const error = new Error("duplicate event");
    error.code = 11000;
    throw error;
  });
  const findOne = t.mock.method(Tenant, "findOne", () => queryFor(tenant));
  const findById = t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const findOneAndUpdate = t.mock.method(
    Tenant,
    "findOneAndUpdate",
    () => queryFor(tenant),
  );

  const duplicate = await signedRequest(
    subscriptionEvent(),
    "already-processed",
  );
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(findOne.mock.callCount(), 0);
  assert.equal(findById.mock.callCount(), 0);
  assert.equal(findOneAndUpdate.mock.callCount(), 0);
});

test("stale signed webhook events do not update a tenant", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const now = Math.floor(Date.now() / 1000);
  const tenant = {
    _id: tenantId,
    status: "active",
    plan: "basic",
    billing: {
      razorpaySubscriptionId: "sub_test_123",
      lastProcessedAt: new Date((now + 20) * 1000),
    },
  };
  t.mock.method(ProcessedWebhookEvent, "create", async () => ({}));
  t.mock.method(Tenant, "findOne", () => queryFor(tenant));
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const update = t.mock.method(Tenant, "findOneAndUpdate", () =>
    queryFor(tenant),
  );

  const response = await signedRequest(
    subscriptionEvent({
      createdAt: now,
      notes: { tenantId: tenantId.toString() },
    }),
    "stale-event",
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reason, "stale-event");
  assert.equal(update.mock.callCount(), 0);
});

test("subscription creation uses only server-configured plan IDs and stores the ID in tenant context", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const tenant = {
    _id: tenantId,
    name: "Acme",
    slug: "acme",
    status: "active",
    plan: "free",
    billing: { status: "inactive" },
  };
  t.mock.method(User, "findById", () =>
    queryFor({ _id: userId, tenantId, role: "admin", isActive: true }),
  );
  t.mock.method(Tenant, "findById", () => queryFor(tenant));
  const updateOne = t.mock.method(Tenant, "updateOne", async (...args) => {
    assert.equal(String(getTenantId()), tenantId.toString());
    return args;
  });
  const nativeFetch = globalThis.fetch;
  let razorpayBody;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(baseUrl)) return nativeFetch(url, options);
    razorpayBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ id: "sub_created_123", short_url: "https://rzp.test/pay" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });

  const response = await fetch(`${baseUrl}/api/billing/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign(
        { id: userId, role: "admin", tenantId },
        TENANT_SECRET,
      )}`,
    },
    body: JSON.stringify({ plan: "basic" }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.data.id, "sub_created_123");
  assert.equal(razorpayBody.plan_id, "plan_basic_test");
  assert.deepEqual(razorpayBody.notes, {
    tenantId: tenantId.toString(),
    plan: "basic",
  });
  assert.equal(Object.hasOwn(razorpayBody, "amount"), false);
  assert.equal(updateOne.mock.calls[0].arguments[1].$set["billing.status"], "pending");
});

test("billing grace expiration suspends tenants within tenant context", async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const expiredTenants = [{ _id: tenantId }];
  t.mock.method(Tenant, "find", () => queryFor(expiredTenants));
  const updates = [];
  t.mock.method(Tenant, "updateOne", async (filter, update) => {
    updates.push({ filter, update, tenantContext: getTenantId() });
    return { modifiedCount: 1 };
  });

  const suspended = await suspendExpiredBillingGrace(new Date());
  assert.equal(suspended, 1);
  assert.equal(String(updates[0].tenantContext), tenantId.toString());
  assert.equal(updates[0].filter["billing.status"], "halted");
  assert.equal(updates[0].update.$set.status, "suspended");
  assert.equal(updates[0].update.$set["billing.suspensionReason"], "non-payment");
});
