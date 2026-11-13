import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  checkSlugAvailability,
  getPublicPlans,
  signupTenant,
  verifyEmail,
} from "../controllers/public.controller.js";
import {
  checkRequestedSlugAvailability,
  submitTenantRequest,
  verifyTenantRequestEmail,
} from "../controllers/tenantRequest.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  publicSignupSchema,
  slugAvailabilitySchema,
  tenantSignupRequestSchema,
  tenantRequestVerificationSchema,
  verifyEmailSchema,
} from "../validations/public.validation.js";

const router = Router();

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many signup attempts. Please try again later.",
  },
});

const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const tenantRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many signup requests. Please try again later.",
  },
});

router.get("/plans", getPublicPlans);
router.get(
  "/slug-available",
  publicReadLimiter,
  validate(slugAvailabilitySchema, "query"),
  checkRequestedSlugAvailability,
);
router.get(
  "/slug-availability",
  publicReadLimiter,
  validate(slugAvailabilitySchema, "query"),
  checkSlugAvailability,
);
router.post(
  "/signup",
  signupLimiter,
  validate(publicSignupSchema),
  signupTenant,
);
router.post(
  "/signup-request",
  tenantRequestLimiter,
  validate(tenantSignupRequestSchema),
  submitTenantRequest,
);
router.get(
  "/signup-request/verify",
  publicReadLimiter,
  validate(tenantRequestVerificationSchema, "query"),
  verifyTenantRequestEmail,
);
router.post(
  "/verify-email",
  publicReadLimiter,
  validate(verifyEmailSchema),
  verifyEmail,
);

export default router;
