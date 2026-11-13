import { Router } from "express";
import authRoutes from "./auth.routes.js";
import attendanceRoutes from "./attendance.routes.js";
import leaveRoutes from "./leave.routes.js";
import adminRoutes from "./admin.routes.js";
import outdoorDutyRoutes from "./od.routes.js";
import userRoutes from "./user.routes.js";
import holidayRoutes from "./holiday.routes.js";
import promanProxyRoutes from "./promanProxy.routes.js";
import uploadsRoutes from "./uploads.routes.js";
import publicRoutes from "./public.routes.js";
import onboardingRoutes from "./onboarding.routes.js";
import billingRoutes from "./billing.routes.js";

const router = Router();

export const SUPER_ADMIN_API_PREFIX = "/api/super";

const routeMounts = [
  ["/public", publicRoutes],
  ["/onboarding", onboardingRoutes],
  ["/billing", billingRoutes],
  ["/auth", authRoutes],
  ["/attendance", attendanceRoutes],
  ["/outdoor-duty", outdoorDutyRoutes],
  ["/leaves", leaveRoutes],
  ["/admin", adminRoutes],
  ["/users", userRoutes],
  ["/holidays", holidayRoutes],
  ["/proman", promanProxyRoutes],
  ["/uploads", uploadsRoutes],
];

export const API_ROUTE_PREFIXES = Object.freeze([
  SUPER_ADMIN_API_PREFIX,
  ...routeMounts.map(([prefix]) => `/api${prefix}`),
]);

for (const [prefix, route] of routeMounts) {
  router.use(prefix, route);
}

export default router;
