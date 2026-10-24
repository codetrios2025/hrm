import Joi from "joi";
import { ROLES } from "../constants/roles.js";

export const createStaffSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().email().required(),
  role: Joi.string().valid(ROLES.EMPLOYEE, ROLES.MANAGER).required(),
  reportingManager: Joi.string().hex().length(24).allow(null, "").optional(),
  casualLeave: Joi.number().integer().min(0).default(12),
  sickLeave: Joi.number().integer().min(0).default(8),
  paidLeave: Joi.number().integer().min(0).default(12),
  optionalHoliday: Joi.number().integer().min(0).default(2),
});

export const updateStaffSchema = Joi.object({
  employeeId: Joi.string().hex().length(24).required(),
  name: Joi.string().trim().min(2).max(60).required(),
  email: Joi.string().email().required(),
  role: Joi.string()
    .valid(ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN)
    .required(),
});
