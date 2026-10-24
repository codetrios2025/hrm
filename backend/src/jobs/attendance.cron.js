import cron from "node-cron";
import { Attendance } from "../models/Attendance.js";

// Runs every night at 23:59 (11:59 PM)
export const initAttendanceCron = () => {
  cron.schedule("59 23 * * *", async () => {
    console.log(
      "[Cron Job] Running midnight auto-punchout for unclosed shifts...",
    );

    try {
      // Find all shifts still marked as in-progress
      const unclosedLogs = await Attendance.find({
        status: "in-progress",
        clockOut: null,
      });

      for (const log of unclosedLogs) {
        // Fallback to last recorded heartbeat timestamp, or clockIn if no heartbeats were received
        const outTime = log.lastActiveAt || log.clockIn;
        log.clockOut = outTime;

        // Calculate hours based on verified active minutes
        const activeHours = parseFloat(
          ((log.activeMinutes || 5) / 60).toFixed(2),
        );
        log.totalHours = activeHours;

        // Apply hour status rules
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
        `[Cron Job] Completed auto-punchout for ${unclosedLogs.length} shifts.`,
      );
    } catch (err) {
      console.error("[Cron Job Error]", err.message);
    }
  });
};
