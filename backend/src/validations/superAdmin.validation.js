import Joi from "joi";

export const superAdminLoginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
});

export const createTenantSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  status: Joi.string().valid("active", "trial").default("active"),
  plan: Joi.string().valid("free", "basic", "pro").default("free"),
  trialEndsAt: Joi.date().allow(null).optional(),
  adminName: Joi.string().trim().min(2).max(60).required(),
  adminEmail: Joi.string().email().required(),
});

export const updateTenantSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  plan: Joi.string().valid("free", "basic", "pro"),
  employeeLimitOverride: Joi.number().integer().min(1).allow(null),
  trialEndsAt: Joi.date().allow(null),
}).min(1);

export const updateTenantStatusSchema = Joi.object({
  status: Joi.string().valid("active", "suspended").required(),
});

export const tenantListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow(""),
  status: Joi.string().valid("trial", "active", "suspended", "deleted"),
  plan: Joi.string().valid("free", "basic", "pro"),
});

export const auditHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

export const tenantRequestListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const tenantRequestIdSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

export const tenantRequestReviewSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected").required(),
  rejectionReason: Joi.when("status", {
    is: "rejected",
    then: Joi.string().trim().min(1).max(1000).required(),
    otherwise: Joi.string().trim().max(1000).allow("").optional(),
  }),
});
