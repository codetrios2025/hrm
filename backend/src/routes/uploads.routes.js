import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { checkPlanLimit } from "../middlewares/checkPlanLimit.js";
import { serveUploadedFile } from "../controllers/uploads.controller.js";

const router = Router();

router.use(authenticate, checkPlanLimit());
router.get("/:category/:fileName", serveUploadedFile);

export default router;
