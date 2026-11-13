import { Router } from "express";
import {
  clockIn,
  clockOut,
  getTodayStatus,
  getMyHistory,
  recordHeartbeat,
} from "../controllers/attendance.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import { validate } from "../middlewares/validate.middleware.js";
import { dateQuerySchema } from "../validations/attendance.validation.js";

const router = Router();

router.use(authenticate, checkPlanLimit());

router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);
router.post("/heartbeat", recordHeartbeat); // Heartbeat ping endpoint
router.get("/today", getTodayStatus);
router.get("/my-history", validate(dateQuerySchema, "query"), getMyHistory);

export default router;
