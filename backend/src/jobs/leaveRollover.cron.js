import cron from "node-cron";
import { User } from "../models/User.js";

/**
 * Year-End Leave Rollover Job
 * Schedule: Runs on December 31 at 23:59 (11:59 PM) in local timezone
 *
 * Rules:
 * 1. Casual Leave (CL) resets to 0 (lapses).
 * 2. Unused Optional Holiday (OH) converts into Paid Leave (PL).
 * 3. OH is then reset for the upcoming year (default: 2 or 0).
 */
export const initLeaveRolloverCron = () => {
  // '59 23 31 12 *' -> Minute 59, Hour 23, Day 31, Month 12 (Dec 31, 11:59 PM)
  cron.schedule(
    "59 23 31 12 *",
    async () => {
      console.log(
        "[Year-End Rollover] Starting year-end leave conversion & lapse process...",
      );

      try {
        const staffUsers = await User.find({ isActive: true });
        let processedCount = 0;

        for (const user of staffUsers) {
          const currentOH = user.leaveBalance?.oh || 0;
          const currentPaid = user.leaveBalance?.paid || 0;

          // 1. Casual Leave becomes 0
          user.leaveBalance.casual = 0;

          // 2. Leftover OH converts into Paid Leave
          if (currentOH > 0) {
            user.leaveBalance.paid = currentPaid + currentOH;
          }

          // 3. Reset OH for upcoming new year (default quota 2)
          user.leaveBalance.oh = 2;

          await user.save();
          processedCount++;
        }

        console.log(
          `[Year-End Rollover] Successfully processed leave rollover for ${processedCount} employees. CL reset to 0; remaining OH converted to Paid Leave.`,
        );
      } catch (err) {
        console.error("[Year-End Rollover Error]:", err.message);
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Kolkata", // Specify your company's primary timezone
    },
  );
};
