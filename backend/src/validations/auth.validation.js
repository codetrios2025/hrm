import Joi from "joi";
import { ROLES } from "../constants/roles.js";

export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(32).required(),
  role: Joi.string()
    .valid(...Object.values(ROLES))
    .default(ROLES.EMPLOYEE),
  reportingManager: Joi.string().hex().length(24).optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(8).max(32).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(32).required(),
});
