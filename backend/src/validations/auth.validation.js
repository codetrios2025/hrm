import Joi from "joi";

export const registerSchema = Joi.object({
  companySlug: Joi.string().trim().lowercase().required(),
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(32).required(),
  reportingManager: Joi.string().hex().length(24).optional(),
});

export const loginSchema = Joi.object({
  companySlug: Joi.string().trim().lowercase().required(),
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  companySlug: Joi.string().trim().lowercase().required(),
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  companySlug: Joi.string().trim().lowercase().required(),
  password: Joi.string().min(8).max(32).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(32).required(),
});
