import Joi from "joi";
import { isValidTenantSlug } from "../config/slugPolicy.js";

export const publicSignupSchema = Joi.object({
  companyName: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .custom((value, helpers) =>
      isValidTenantSlug(value)
        ? value
        : helpers.error("any.invalid", { value }),
    )
    .required()
    .messages({
      "any.invalid":
        "Company slug must use lowercase letters, numbers, and hyphens, and cannot be a reserved word",
    }),
  adminName: Joi.string().trim().min(2).max(60).required(),
  adminEmail: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(32).required(),
  website: Joi.string().allow("").optional(),
});

export const slugAvailabilitySchema = Joi.object({
  slug: Joi.string().trim().lowercase().min(1).max(63).required(),
});

export const verifyEmailSchema = Joi.object({
  companySlug: Joi.string().trim().lowercase().required(),
  token: Joi.string().hex().length(64).required(),
});

export const tenantSignupRequestSchema = Joi.object({
  companyName: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .custom((value, helpers) =>
      isValidTenantSlug(value)
        ? value
        : helpers.error("any.invalid", { value }),
    )
    .required()
    .messages({
      "any.invalid":
        "Company code must use lowercase letters, numbers, and hyphens, and cannot be a reserved word",
    }),
  contactName: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().trim().lowercase().email().max(254).required(),
  phone: Joi.string().trim().min(5).max(30).required(),
  employeeCountEstimate: Joi.number().integer().min(1).max(100000).required(),
  message: Joi.string().trim().max(1000).allow("").default(""),
  website: Joi.string().max(500).allow("").default(""),
});

export const tenantRequestVerificationSchema = Joi.object({
  token: Joi.string().hex().length(64).required(),
});

