import { Router } from "express";
import {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../validations/auth.validation.js";

const router = Router();

router.post(
  "/register",
  validate(registerSchema),
  checkPlanLimit({ resolveByCompanySlug: true, employeeDelta: 1 }),
  register,
);
router.post("/login", validate(loginSchema), login);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post(
  "/reset-password/:token",
  validate(resetPasswordSchema),
  resetPassword,
);

// Authenticated user routes
router.get("/me", authenticate, getMe);
router.patch(
  "/change-password",
  authenticate,
  checkPlanLimit(),
  validate(changePasswordSchema),
  changePassword,
);

export default router;
