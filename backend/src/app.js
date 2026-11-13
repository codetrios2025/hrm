import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import routes, { SUPER_ADMIN_API_PREFIX } from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/ApiError.js";
import { ENV } from "./config/env.js";
import { handleRazorpayWebhook } from "./controllers/billing.controller.js";
import superAdminRoutes from "./routes/superAdmin.routes.js";

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

console.log("Frontend path:", frontendPath);

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

app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleRazorpayWebhook,
);

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

app.use("/uploads", (req, res, next) => {
  next(new ApiError(404, "Use the authenticated file endpoint"));
});

/*
|--------------------------------------------------------------------------
| Serve React Static Files
|--------------------------------------------------------------------------
*/

app.use(express.static(frontendPath));

/*
|--------------------------------------------------------------------------
| Platform Super Admin API
|--------------------------------------------------------------------------
*/

app.use(SUPER_ADMIN_API_PREFIX, superAdminRoutes);

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
