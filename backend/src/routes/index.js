import { Router } from "express";
import authRoutes from "./auth.routes.js";
import attendanceRoutes from "./attendance.routes.js";
import leaveRoutes from "./leave.routes.js";
import adminRoutes from "./admin.routes.js";
import outdoorDutyRoutes from "./od.routes.js";
import userRoutes from "./user.routes.js";
import holidayRoutes from "./holiday.routes.js";
import promanProxyRoutes from "./promanProxy.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/outdoor-duty", outdoorDutyRoutes);
router.use("/leaves", leaveRoutes);
router.use("/admin", adminRoutes);
router.use("/users", userRoutes);
router.use("/holidays", holidayRoutes);
router.use("/proman", promanProxyRoutes);

export default router;
