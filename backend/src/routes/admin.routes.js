import { Router } from "express";
import {
  getAllStaff,
  assignManager,
  updateLeaveBalance,
  createStaffUser,
  exportAttendanceReport,
  updateStaffDetails,
  toggleStaffStatus,
  bulkImportStaff, // Import controller
  getLeaveHistoryReport,
  applyLeaveForEmployee,
  triggerYearEndRollover,
  directMarkAttendance,
  getTodayEmployeeAttendance,
  getEmployeeAttendanceHistory,
  grantLeaveToAll,
  exportLeaveHistoryReport,
  resetEmployeePassword,
} from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { uploadCsv } from "../middlewares/upload.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(authenticate);
router.use(authorize(ROLES.ADMIN));

router.post("/bulk-import", uploadCsv.single("file"), bulkImportStaff); // Bulk import route
router.get("/export-attendance", exportAttendanceReport);
// Today's attendance of all employees
router.get("/today-employee-attendance", getTodayEmployeeAttendance);

// Selected employee monthly attendance
router.get("/employee-attendance-history", getEmployeeAttendanceHistory);
router.get("/today-employee-attendance", getTodayEmployeeAttendance);
router.post("/create-staff", createStaffUser);
router.get("/staff", getAllStaff);
router.patch("/assign-manager", assignManager);
router.patch("/adjust-balance", updateLeaveBalance);
router.patch("/update-staff", updateStaffDetails);
router.patch("/toggle-status", toggleStaffStatus);
router.get("/leave-history", getLeaveHistoryReport);
router.post("/apply-employee-leave", applyLeaveForEmployee);
router.post("/trigger-year-end-rollover", triggerYearEndRollover);
router.post("/direct-attendance", directMarkAttendance);
router.post("/grant-leave-all", grantLeaveToAll);
router.get("/export-leave-history", exportLeaveHistoryReport);
router.post("/employee-reset-password", resetEmployeePassword);

export default router;
