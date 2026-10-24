import Joi from "joi";

export const applyLeaveSchema = Joi.object({
  leaveType: Joi.string()
    .valid(
      "casual",
      "sick",
      "paid",
      "oh",
      "lwp",
      "coff",
      "maternity",
      "paternity",
      "bereavement",
    )
    .required(),
  startDate: Joi.date().iso().required(),
  // Make endDate optional if it's a half-day
  endDate: Joi.date()
    .iso()
    .min(Joi.ref("startDate"))
    .optional()
    .allow("", null),
  reason: Joi.string().trim().min(3).max(500).required(),
  // Add validation rules for half-day fields so they aren't stripped out
  isHalfDay: Joi.any().optional(),
  halfDaySession: Joi.string()
    .valid("first", "second", "")
    .optional()
    .allow(null),
});

export const reviewLeaveSchema = Joi.object({
  status: Joi.string()
    .valid("pending", "approved", "rejected", "cancelled")
    .required(),
  rejectionReason: Joi.string().trim().max(250).allow("", null).optional(),
});
