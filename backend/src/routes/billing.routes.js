import { Router } from "express";
import { handleRazorpayWebhook, subscribe } from "../controllers/billing.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import { validate } from "../middlewares/validate.middleware.js";
import Joi from "joi";

const router = Router();

router.post(
  "/subscribe",
  authenticate,
  authorize(ROLES.ADMIN),
  validate(
    Joi.object({
      plan: Joi.string().valid("free", "basic", "pro").required(),
    }),
  ),
  subscribe,
);
router.post("/webhook", handleRazorpayWebhook);

export default router;
