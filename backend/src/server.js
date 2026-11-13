import app from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";
import { User } from "./models/User.js";
import Tenant from "./models/Tenant.js";
import { initAttendanceCron } from "./jobs/attendance.cron.js";
import { initLeaveRolloverCron } from "./jobs/leaveRollover.cron.js";
import { initBillingGraceCron } from "./jobs/billingGrace.cron.js";
import { API_ROUTE_PREFIXES } from "./routes/index.js";

// Connect Database
await connectDB();

// After connecting to database:
initAttendanceCron();
initLeaveRolloverCron();
initBillingGraceCron();

// Assign fallback unique employee IDs to existing documents missing the field
const tenants = await Tenant.find({}).select("_id").lean();
for (const tenant of tenants) {
  const usersWithoutEmpId = await User.find({
    tenantId: tenant._id,
    employeeId: { $exists: false },
  });
  for (let i = 0; i < usersWithoutEmpId.length; i++) {
    usersWithoutEmpId[i].employeeId = `EMP${String(1001 + i).padStart(4, "0")}`;
    await usersWithoutEmpId[i].save();
  }
}

const server = app.listen(ENV.PORT, () => {
  console.log(
    `[Process] Server running in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`,
  );
  console.log(`[Routes] Mounted API prefixes: ${API_ROUTE_PREFIXES.join(", ")}`);
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
