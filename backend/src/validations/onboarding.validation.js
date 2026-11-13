import Joi from "joi";

const leavePolicySchema = Joi.object({
  casual: Joi.number().min(0).max(365).required(),
  sick: Joi.number().min(0).max(365).required(),
  paid: Joi.number().min(0).max(365).required(),
  oh: Joi.number().min(0).max(365).required(),
  coff: Joi.number().min(0).max(365).required(),
  maternity: Joi.number().min(0).max(365).required(),
  paternity: Joi.number().min(0).max(365).required(),
  bereavement: Joi.number().min(0).max(365).required(),
  lwp: Joi.number().min(0).max(365).required(),
});

export const onboardingUpdateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  companyProfile: Joi.object({
    website: Joi.string().uri().allow(""),
    phone: Joi.string().trim().max(40).allow(""),
    address: Joi.string().trim().max(250).allow(""),
    city: Joi.string().trim().max(100).allow(""),
    country: Joi.string().trim().max(100).allow(""),
  }).min(1),
  leavePolicy: leavePolicySchema,
  step: Joi.number().integer().min(1).max(5),
  completed: Joi.boolean().valid(true),
}).min(1);
