import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/ApiError.js";
import { ENV } from "./config/env.js";

const app = express();

/*
|--------------------------------------------------------------------------
| __dirname for ES Modules
|--------------------------------------------------------------------------
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
|--------------------------------------------------------------------------
| Paths
|--------------------------------------------------------------------------
|
| app.js:
| backend/src/app.js
|
| uploads:
| backend/uploads
|
| frontend:
| frontend/dist
|
*/

const frontendPath = path.join(__dirname, "../../frontend/dist");

// IMPORTANT:
// src -> ../uploads = backend/uploads
const uploadsPath = path.join(__dirname, "../uploads");

console.log("Frontend path:", frontendPath);
console.log("Uploads path:", uploadsPath);

/*
|--------------------------------------------------------------------------
| Security Headers
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ["https://attendence.olive.in"]
    : [
        "http://localhost:5174",
        "http://localhost:5173",
        "http://localhost:5175",
      ];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

/*
|--------------------------------------------------------------------------
| Additional Cross-Origin Headers
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

/*
|--------------------------------------------------------------------------
| Rate Limiter
|--------------------------------------------------------------------------
*/

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message:
    "Too many requests created from this IP, please try again after 15 minutes",
});

app.use("/api", limiter);

/*
|--------------------------------------------------------------------------
| Body Parsers
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: "10mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "10kb",
  }),
);

/*
|--------------------------------------------------------------------------
| IMPORTANT: Serve Uploaded Files
|--------------------------------------------------------------------------
|
| Physical file:
|
| backend/uploads/prescriptions/abc.pdf
|
| Browser URL:
|
| http://localhost:5000/uploads/prescriptions/abc.pdf
|
*/

app.use(
  "/uploads",
  express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      // Allow PDF/images to be opened in browser
      if (filePath.toLowerCase().endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }
    },
  }),
);

/*
|--------------------------------------------------------------------------
| Serve React Static Files
|--------------------------------------------------------------------------
*/

app.use(express.static(frontendPath));

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use("/api", routes);

/*
|--------------------------------------------------------------------------
| React Frontend Routes
|--------------------------------------------------------------------------
*/

app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found on this server`));
});

/*
|--------------------------------------------------------------------------
| Centralized Error Middleware
|--------------------------------------------------------------------------
*/

app.use(errorHandler);

/*
|--------------------------------------------------------------------------
| Export App
|--------------------------------------------------------------------------
*/

export default app;
