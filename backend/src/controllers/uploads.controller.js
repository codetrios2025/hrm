import { Leave } from "../models/Leave.js";
import { User } from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getTenantUploadFilePath } from "../utils/uploadPaths.js";

const categories = new Set(["documents", "prescriptions"]);
const fileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const serveUploadedFile = asyncHandler(async (req, res, next) => {
  const { category, fileName } = req.params;

  if (!categories.has(category) || !fileNamePattern.test(fileName)) {
    throw new ApiError(404, "File not found");
  }

  const isAdmin = req.user.role === ROLES.ADMIN;
  const fileFilter =
    category === "documents"
      ? {
          tenantId: req.tenantId,
          ...(isAdmin ? {} : { _id: req.user._id }),
          "documents.fileName": fileName,
        }
      : {
          tenantId: req.tenantId,
          ...(isAdmin ? {} : { userId: req.user._id }),
          "prescription.fileName": fileName,
        };
  const fileExists =
    category === "documents"
      ? await User.exists(fileFilter)
      : await Leave.exists(fileFilter);

  if (!fileExists) {
    throw new ApiError(404, "File not found");
  }

  const filePath = getTenantUploadFilePath(req.tenantId, category, fileName);

  res.sendFile(
    filePath,
    { headers: { "Content-Disposition": "inline" } },
    (error) => {
      if (error) next(error);
    },
  );
});
