import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  getProfile,
  updateProfile,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
} from "../controllers/user.controller.js";
import { uploadDocument } from "../middlewares/documentUpload.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.post(
  "/:userId/documents",
  uploadDocument.single("document"),
  uploadEmployeeDocument,
);
router.delete("/:userId/documents/:docId", deleteEmployeeDocument);

export default router;
