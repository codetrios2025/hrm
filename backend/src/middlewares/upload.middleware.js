import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

const storage = multer.memoryStorage();

// const fileFilter = (req, file, cb) => {
//   if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
//     cb(null, true);
//   } else {
//     cb(new ApiError(400, "Only .csv files are supported"), false);
//   }
// };

const fileFilter = (req, file, cb) => {
  const isCsv =
    file.mimetype === "text/csv" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.originalname.toLowerCase().endsWith(".csv");

  if (isCsv) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only .csv files are supported"), false);
  }
};

export const uploadCsv = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});
