import Joi from "joi";

const holidayFields = {
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      "any.required": "Holiday date is required",
      "string.empty": "Holiday date is required",
      "string.pattern.base": "Holiday date must be in YYYY-MM-DD format",
    }),

  title: Joi.string().trim().min(2).max(150).required().messages({
    "any.required": "Holiday title is required",
    "string.empty": "Holiday title is required",
    "string.min": "Holiday title must contain at least 2 characters",
    "string.max": "Holiday title cannot exceed 150 characters",
  }),

  description: Joi.string().allow("").allow(null).max(500).default(""),
};

/*
|--------------------------------------------------------------------------
| Create
|--------------------------------------------------------------------------
*/

export const createHolidaySchema = Joi.object({
  ...holidayFields,
});

/*
|--------------------------------------------------------------------------
| Update
|--------------------------------------------------------------------------
*/

export const updateHolidaySchema = Joi.object({
  ...holidayFields,
});
