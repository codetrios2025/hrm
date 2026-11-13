import { Router } from "express";
import {
  getOnboarding,
  updateOnboarding,
} from "../controllers/onboarding.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import { ROLES } from "../constants/roles.js";
import { validate } from "../middlewares/validate.middleware.js";
import { onboardingUpdateSchema } from "../validations/onboarding.validation.js";

const router = Router();

router.use(authenticate, authorize(ROLES.ADMIN), checkPlanLimit());
router.get("/", getOnboarding);
router.patch("/", validate(onboardingUpdateSchema), updateOnboarding);

export default router;
