import cron from "node-cron";
import TenantRequest from "../models/TenantRequest.js";
import { ENV } from "../config/env.js";
import { sendSuperAdminTenantRequestReminderEmail } from "../utils/email.js";

const dayInMs = 24 * 60 * 60 * 1000;
const weekInMs = 7 * dayInMs;

export const runTenantRequestMaintenance = async (now = new Date()) => {
  const unverifiedCutoff = new Date(now.getTime() - weekInMs);
  const cleanup = await TenantRequest.deleteMany({
    status: "pending",
    emailVerified: false,
    createdAt: { $lt: unverifiedCutoff },
  });
  if (cleanup.deletedCount) {
    console.log(
      `[Tenant Request Cron] Deleted ${cleanup.deletedCount} unverified requests older than 7 days.`,
    );
  }

  const pendingRequests = await TenantRequest.find({
    status: "pending",
    emailVerified: true,
  })
    .select("_id companyName slug contactName email createdAt")
    .sort({ createdAt: 1 })
    .lean();
  const overdueCutoff = new Date(now.getTime() - dayInMs);
  if (!pendingRequests.some((request) => request.createdAt <= overdueCutoff)) {
    return { deletedCount: cleanup.deletedCount, reminderCount: 0 };
  }

  if (!ENV.SUPER_ADMIN_NOTIFY_EMAIL) {
    throw new Error(
      "SUPER_ADMIN_NOTIFY_EMAIL must be configured to send pending request reminders",
    );
  }
  await sendSuperAdminTenantRequestReminderEmail({
    requests: pendingRequests,
  });
  console.log(
    `[Tenant Request Cron] Sent a reminder listing ${pendingRequests.length} pending verified requests.`,
  );
  return {
    deletedCount: cleanup.deletedCount,
    reminderCount: pendingRequests.length,
  };
};

export const initTenantRequestCron = () =>
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        await runTenantRequestMaintenance();
      } catch (error) {
        console.error("[Tenant Request Cron] Maintenance failed:", error);
      }
    },
    { scheduled: true, timezone: "Asia/Kolkata" },
  );
