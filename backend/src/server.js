import app from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";
import { User } from "./models/User.js";
import { initAttendanceCron } from "./jobs/attendance.cron.js";
import { initLeaveRolloverCron } from "./jobs/leaveRollover.cron.js";

// Connect Database
await connectDB();

// After connecting to database:
initAttendanceCron();
initLeaveRolloverCron();

// Assign fallback unique employee IDs to existing documents missing the field
const usersWithoutEmpId = await User.find({ employeeId: { $exists: false } });
for (let i = 0; i < usersWithoutEmpId.length; i++) {
  usersWithoutEmpId[i].employeeId = `EMP${String(1001 + i).padStart(4, "0")}`;
  await usersWithoutEmpId[i].save();
}

const server = app.listen(ENV.PORT, () => {
  console.log(
    `[Process] Server running in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`,
  );
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("[Unhandled Rejection]", err.message);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]", err.message);
  process.exit(1);
});
