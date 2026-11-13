import cron from "node-cron";
import Tenant from "../models/Tenant.js";
import { runWithTenant } from "../utils/tenantContext.js";

export const suspendExpiredBillingGrace = async (now = new Date()) => {
  const expiredTenants = await Tenant.find({
    status: { $ne: "deleted" },
    "billing.status": "halted",
    "billing.graceUntil": { $lte: now },
  })
    .select("_id")
    .lean();

  let suspended = 0;
  for (const { _id: tenantId } of expiredTenants) {
    await runWithTenant(tenantId, async () => {
      const result = await Tenant.updateOne(
        {
          _id: tenantId,
          status: { $ne: "deleted" },
          "billing.status": "halted",
          "billing.graceUntil": { $lte: now },
        },
        {
          $set: {
            status: "suspended",
            "billing.status": "suspended",
            "billing.suspensionReason": "non-payment",
          },
        },
      );
      if (result.modifiedCount) suspended++;
    });
  }
  return suspended;
};

export const initBillingGraceCron = () =>
  cron.schedule("0 * * * *", async () => {
    try {
      const suspended = await suspendExpiredBillingGrace();
      if (suspended) {
        console.log(`[Billing] Suspended ${suspended} tenants after grace period.`);
      }
    } catch (error) {
      console.error("[Billing] Grace-period suspension failed:", error.message);
    }
  });
