import { Router } from "express";
import {
  applyLeave,
  getMyLeaves,
  getTeamLeaves,
  reviewLeave,
  cancelLeave,
} from "../controllers/leave.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  applyLeaveSchema,
  reviewLeaveSchema,
} from "../validations/leave.validation.js";
import { ROLES } from "../constants/roles.js";
import uploadPrescription from "../middlewares/uploadPrescription.js";

const router = Router();

router.use(authenticate, checkPlanLimit());

// Employee routes
router.post(
  "/apply",
  uploadPrescription.single("prescription"),
  validate(applyLeaveSchema),
  applyLeave,
);
router.get("/my-leaves", getMyLeaves);
router.patch("/:id/cancel", cancelLeave);

// Manager / Admin Routes
router.get("/all", authorize(ROLES.MANAGER, ROLES.ADMIN), getTeamLeaves);
router.patch(
  "/:id/review",
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validate(reviewLeaveSchema),
  reviewLeave,
);

export default router;
