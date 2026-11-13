import { Router } from "express";

import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  importHolidays,
} from "../controllers/holiday.controller.js";

import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import { ApiError } from "../utils/ApiError.js";

import { validate } from "../middlewares/validate.middleware.js";

import {
  createHolidaySchema,
  updateHolidaySchema,
} from "../validations/holiday.validation.js";

import { uploadCsv } from "../middlewares/upload.middleware.js";

import { ROLES } from "../constants/roles.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
|
| All holiday APIs require login.
|--------------------------------------------------------------------------
*/

router.use(authenticate, checkPlanLimit(), (req, res, next) => {
  if (!req.user.tenantId) {
    return next(new ApiError(403, "Tenant context is required"));
  }
  req.tenantId = req.user.tenantId;
  next();
});

/*
|--------------------------------------------------------------------------
| GET HOLIDAYS
|--------------------------------------------------------------------------
|
| All authenticated users can read official holidays.
|
| Employees need this for their attendance sheet.
|--------------------------------------------------------------------------
*/

router.get("/", getHolidays);

/*
|--------------------------------------------------------------------------
| CREATE HOLIDAY
|--------------------------------------------------------------------------
|
| HR/Admin only.
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  authorize(ROLES.ADMIN),
  validate(createHolidaySchema),
  createHoliday,
);

/*
|--------------------------------------------------------------------------
| IMPORT HOLIDAYS FROM CSV
|--------------------------------------------------------------------------
|
| HR/Admin only.
|
| CSV field name:
| file
|
| Example:
|
| POST /api/holidays/import
|--------------------------------------------------------------------------
*/

router.post(
  "/import",
  authorize(ROLES.ADMIN),
  uploadCsv.single("file"),
  importHolidays,
);

/*
|--------------------------------------------------------------------------
| UPDATE HOLIDAY
|--------------------------------------------------------------------------
|
| HR/Admin only.
|--------------------------------------------------------------------------
*/

router.put(
  "/:id",
  authorize(ROLES.ADMIN),
  validate(updateHolidaySchema),
  updateHoliday,
);

/*
|--------------------------------------------------------------------------
| DELETE HOLIDAY
|--------------------------------------------------------------------------
|
| HR/Admin only.
|--------------------------------------------------------------------------
*/

router.delete("/:id", authorize(ROLES.ADMIN), deleteHoliday);

export default router;
