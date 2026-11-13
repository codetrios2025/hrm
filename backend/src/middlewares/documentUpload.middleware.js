import multer from "multer";
import path from "path";
import { ApiError } from "../utils/ApiError.js";
import { ensureTenantUploadDirectory } from "../utils/uploadPaths.js";

// Configure Disk Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, ensureTenantUploadDirectory(req.tenantId, "documents"));
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

// File Filter for Employee Documents (PDFs, Images)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        400,
        "Only PDF, JPEG, JPG, and PNG files are allowed for employee documents.",
      ),
      false,
    );
  }
};

export const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Max File Size
});
