import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const uploadsRoot = path.resolve(
  fileURLToPath(new URL("../../uploads/", import.meta.url)),
);
const categories = new Set(["documents", "prescriptions"]);
const tenantIdPattern = /^[a-f\d]{24}$/i;
const fileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const getTenantUploadDirectory = (tenantId, category) => {
  const tenantKey = String(tenantId || "");
  if (!tenantIdPattern.test(tenantKey) || !categories.has(category)) {
    throw new TypeError("Invalid tenant upload directory");
  }

  const directory = path.resolve(uploadsRoot, tenantKey, category);
  if (!directory.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new TypeError("Invalid tenant upload directory");
  }
  return directory;
};

export const ensureTenantUploadDirectory = (tenantId, category) => {
  const directory = getTenantUploadDirectory(tenantId, category);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

export const getTenantUploadFilePath = (tenantId, category, fileName) => {
  if (!fileNamePattern.test(fileName || "")) {
    throw new TypeError("Invalid uploaded file name");
  }
  return path.join(getTenantUploadDirectory(tenantId, category), fileName);
};

export const getTenantUploadStoredPath = (tenantId, category, fileName) =>
  `/uploads/${tenantId}/${category}/${fileName}`;
