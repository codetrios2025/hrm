import { Router } from "express";
import {
  createTenant,
  deleteTenant,
  getSuperAdminStats,
  getTenantAuditHistory,
  getTenantDetails,
  getTenants,
  superAdminLogin,
  updateTenant,
  updateTenantStatus,
} from "../controllers/superAdmin.controller.js";
import {
  approveTenantRequest,
  getSuperAdminNotifications,
  getTenantRequest,
  getTenantRequests,
  markAllSuperAdminNotificationsRead,
  markSuperAdminNotificationRead,
  rejectTenantRequest,
} from "../controllers/tenantRequest.controller.js";
import {
  auditSuperAction,
  authenticateSuper,
} from "../middlewares/superAdmin.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createTenantSchema,
  auditHistoryQuerySchema,
  superAdminLoginSchema,
  tenantListQuerySchema,
  tenantRequestApprovalSchema,
  tenantRequestListQuerySchema,
  tenantRequestRejectionSchema,
  tenantRequestIdSchema,
  notificationListQuerySchema,
  updateTenantSchema,
  updateTenantStatusSchema,
} from "../validations/superAdmin.validation.js";

const router = Router();

export const SUPER_ADMIN_AUTH_LOGIN_PATH = "/auth/login";

router.post(
  SUPER_ADMIN_AUTH_LOGIN_PATH,
  validate(superAdminLoginSchema),
  superAdminLogin,
);

router.use(authenticateSuper, auditSuperAction);

router.get("/tenants", validate(tenantListQuerySchema, "query"), getTenants);
router.get(
  "/requests",
  validate(tenantRequestListQuerySchema, "query"),
  getTenantRequests,
);
router.get(
  "/requests/:id",
  validate(tenantRequestIdSchema, "params"),
  getTenantRequest,
);
router.post(
  "/requests/:id/approve",
  validate(tenantRequestIdSchema, "params"),
  validate(tenantRequestApprovalSchema),
  approveTenantRequest,
);
router.post(
  "/requests/:id/reject",
  validate(tenantRequestIdSchema, "params"),
  validate(tenantRequestRejectionSchema),
  rejectTenantRequest,
);
router.get(
  "/notifications",
  validate(notificationListQuerySchema, "query"),
  getSuperAdminNotifications,
);
router.patch(
  "/notifications/read-all",
  markAllSuperAdminNotificationsRead,
);
router.patch(
  "/notifications/:id/read",
  validate(tenantRequestIdSchema, "params"),
  markSuperAdminNotificationRead,
);
router.post("/tenants", validate(createTenantSchema), createTenant);
router.get("/tenants/:id", getTenantDetails);
router.get(
  "/tenants/:id/audit",
  validate(auditHistoryQuerySchema, "query"),
  getTenantAuditHistory,
);
router.patch(
  "/tenants/:id",
  validate(updateTenantSchema),
  updateTenant,
);
router.patch(
  "/tenants/:id/status",
  validate(updateTenantStatusSchema),
  updateTenantStatus,
);
router.delete("/tenants/:id", deleteTenant);
router.get("/stats", getSuperAdminStats);

export default router;
