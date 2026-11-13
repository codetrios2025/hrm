import assert from "node:assert/strict";
import { test } from "node:test";
import cron from "node-cron";

process.env.SUPER_ADMIN_NOTIFY_EMAIL = "platform@example.com";

const [
  { default: TenantRequest },
  { emailTransport },
  { ENV },
  { initTenantRequestCron, runTenantRequestMaintenance },
] = await Promise.all([
  import("../src/models/TenantRequest.js"),
  import("../src/utils/email.js"),
  import("../src/config/env.js"),
  import("../src/jobs/tenantRequest.cron.js"),
]);

const queryFor = (value) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  lean() {
    return Promise.resolve(value);
  },
});

test("daily request maintenance deletes stale unverified requests and emails all pending requests when overdue", async (t) => {
  const now = new Date("2026-11-13T10:00:00.000Z");
  const oldPending = {
    _id: "old-request",
    companyName: "Old Company",
    slug: "old-company",
    contactName: "Olive Admin",
    email: "olive@example.com",
    createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
  };
  const recentPending = {
    _id: "recent-request",
    companyName: "Recent Company",
    slug: "recent-company",
    contactName: "Recent Admin",
    email: "recent@example.com",
    createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
  };
  let deleteFilter;
  t.mock.method(TenantRequest, "deleteMany", async (filter) => {
    deleteFilter = filter;
    return { deletedCount: 3 };
  });
  let findFilter;
  t.mock.method(TenantRequest, "find", (filter) => {
    findFilter = filter;
    return queryFor([oldPending, recentPending]);
  });
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));
  t.mock.method(console, "log", () => {});

  const result = await runTenantRequestMaintenance(now);

  assert.equal(result.deletedCount, 3);
  assert.equal(result.reminderCount, 2);
  assert.deepEqual(deleteFilter, {
    status: "pending",
    emailVerified: false,
    createdAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
  });
  assert.deepEqual(findFilter, { status: "pending", emailVerified: true });
  assert.equal(sendMail.mock.callCount(), 1);
  const mail = sendMail.mock.calls[0].arguments[0];
  assert.equal(mail.to, ENV.SUPER_ADMIN_NOTIFY_EMAIL);
  assert.match(mail.subject, /2 pending/);
  assert.match(mail.html, /Old Company/);
  assert.match(mail.html, /Recent Company/);
  assert.match(mail.html, /super-admin\/requests\/old-request/);
});

test("daily request cron is scheduled at 9 AM India time and runs maintenance", async (t) => {
  const scheduled = [];
  t.mock.method(cron, "schedule", (expression, callback, options) => {
    scheduled.push({ expression, callback, options });
    return { stop() {} };
  });
  const deleteMany = t.mock.method(TenantRequest, "deleteMany", async () => ({
    deletedCount: 0,
  }));
  const find = t.mock.method(TenantRequest, "find", () => queryFor([]));
  initTenantRequestCron();

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].expression, "0 9 * * *");
  assert.equal(scheduled[0].options.timezone, "Asia/Kolkata");
  await scheduled[0].callback();
  assert.equal(deleteMany.mock.callCount(), 1);
  assert.equal(find.mock.callCount(), 1);
});

test("request maintenance does not send reminders when no verified request is overdue", async (t) => {
  const now = new Date("2026-11-13T10:00:00.000Z");
  t.mock.method(TenantRequest, "deleteMany", async () => ({ deletedCount: 0 }));
  t.mock.method(TenantRequest, "find", () =>
    queryFor([
      {
        _id: "recent-request",
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
    ]),
  );
  const sendMail = t.mock.method(emailTransport, "sendMail", async () => ({}));

  const result = await runTenantRequestMaintenance(now);

  assert.deepEqual(result, { deletedCount: 0, reminderCount: 0 });
  assert.equal(sendMail.mock.callCount(), 0);
});
