import { Router } from "express";
import {
  applyOutdoorDuty,
  getMyODRequests,
  getPendingODRequests,
  reviewOutdoorDuty,
} from "../controllers/od.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { applyODSchema, reviewODSchema } from "../validations/od.validation.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(authenticate);

// ---------------- Employee Routes ----------------
router.post("/", applyOutdoorDuty);
router.post("/apply", validate(applyODSchema), applyOutdoorDuty);
router.get("/my-requests", getMyODRequests);

// ---------------- Combined/Role-based Listing ----------------
router.get("/", (req, res, next) => {
  if (req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER) {
    return getPendingODRequests(req, res, next);
  }
  return getMyODRequests(req, res, next);
});

// ---------------- Approver Routes (Manager & Admin) ----------------
router.get(
  "/pending",
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  getPendingODRequests,
);

router.patch(
  "/:id/review",
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  validate(reviewODSchema),
  reviewOutdoorDuty,
);

// Quick action aliases for frontend button clicks
router.patch(
  "/:id/approve",
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  (req, res, next) => {
    req.body = req.body || {};
    req.body.status = "approved";
    return reviewOutdoorDuty(req, res, next);
  },
);

router.patch(
  "/:id/reject",
  authorize(ROLES.MANAGER, ROLES.ADMIN),
  (req, res, next) => {
    req.body = req.body || {};
    req.body.status = "rejected";
    return reviewOutdoorDuty(req, res, next);
  },
);

export default router;
