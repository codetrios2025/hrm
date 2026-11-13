import Joi from "joi";

export const applyODSchema = Joi.object({
  date: Joi.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  startTime: Joi.string()
    .regex(/^\d{2}:\d{2}$/)
    .required(),
  endTime: Joi.string()
    .regex(/^\d{2}:\d{2}$/)
    .required(),
  location: Joi.string().trim().allow("").optional(),
  reason: Joi.string().trim().min(3).max(500).required(),
});

export const reviewODSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected").required(),
  rejectionReason: Joi.string().trim().max(250).allow("", null).optional(),
});
