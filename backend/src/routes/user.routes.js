import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import {
  getProfile,
  updateProfile,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
} from "../controllers/user.controller.js";
import { uploadDocument } from "../middlewares/documentUpload.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(authenticate, checkPlanLimit());

const authorizeDocumentOwner = (req, res, next) => {
  if (
    req.user.role !== ROLES.ADMIN &&
    String(req.user._id) !== req.params.userId
  ) {
    return next(new ApiError(403, "You may only manage your own documents"));
  }

  next();
};

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.post(
  "/:userId/documents",
  authorizeDocumentOwner,
  uploadDocument.single("document"),
  uploadEmployeeDocument,
);
router.delete(
  "/:userId/documents/:docId",
  authorizeDocumentOwner,
  deleteEmployeeDocument,
);

export default router;
