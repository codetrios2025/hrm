import cron from "node-cron";
import { Attendance } from "../models/Attendance.js";
import Tenant from "../models/Tenant.js";
import { getTenantId, runWithTenant } from "../utils/tenantContext.js";

// Runs every night at 23:59 (11:59 PM)
export const initAttendanceCron = () => {
  cron.schedule("59 23 * * *", async () => {
    console.log(
      "[Cron Job] Running midnight auto-punchout for unclosed shifts...",
    );

    try {
      const activeTenants = await Tenant.find({ status: "active" })
        .select("_id")
        .lean();

      for (const tenant of activeTenants) {
        try {
          await runWithTenant(tenant._id, async () => {
            const tenantId = getTenantId();
            const unclosedLogs = await Attendance.find({
              tenantId,
              status: "in-progress",
              clockOut: null,
            });

            for (const log of unclosedLogs) {
              const outTime = log.lastActiveAt || log.clockIn;
              log.clockOut = outTime;

              const activeHours = parseFloat(
                ((log.activeMinutes || 5) / 60).toFixed(2),
              );
              log.totalHours = activeHours;

              if (activeHours >= 9) {
                log.status = "present";
              } else if (activeHours >= 7 && activeHours < 9) {
                log.status = "short-leave";
              } else if (activeHours >= 5 && activeHours < 7) {
                log.status = "half-day";
              } else {
                log.status = "absent";
              }

              await log.save();
            }

            console.log(
              `[Cron Job] Completed auto-punchout for tenant ${tenantId}: ${unclosedLogs.length} shifts.`,
            );
          });
        } catch (err) {
          console.error(
            `[Cron Job Error] Tenant ${tenant._id}:`,
            err.message,
          );
        }
      }
    } catch (err) {
      console.error("[Cron Job Error]", err.message);
    }
  });
};
