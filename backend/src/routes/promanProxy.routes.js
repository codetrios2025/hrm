import express from "express";
import { ENV } from "../config/env.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { checkPlanLimit, requirePlanFeature } from "../middlewares/checkPlanLimit.js";
import Tenant from "../models/Tenant.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();
const defaultPromanBaseUrl =
  ENV.HRM_PROMAN_BASE_URL || "https://proman.olive.in/api/tasks";
const defaultPromanSecret =
  ENV.HRM_PROMAN_SECRET || "olive_shared_secret_token_987654321_xyz";

router.use(authenticate, checkPlanLimit(), requirePlanFeature("taskTimeTracker"));

const getPromanSettings = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId)
    .select("slug proman.baseUrl +proman.secret")
    .lean();

  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  const useDefaultFallback = tenant.slug === "default";
  const baseUrl =
    tenant.proman?.baseUrl ||
    (useDefaultFallback ? defaultPromanBaseUrl : null);
  const secret =
    tenant.proman?.secret ||
    (useDefaultFallback ? defaultPromanSecret : null);

  if (!baseUrl || !secret) {
    throw new ApiError(503, "Proman is not configured for this tenant");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    secret,
  };
};

const proxyRequest = async (req, res, endpoint, method, body) => {
  const { baseUrl, secret } = await getPromanSettings(req.tenantId);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        "x-hrm-key": secret,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    return res.status(response.status).json(await response.json());
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/proman/tasks
router.get("/tasks", (req, res) =>
  proxyRequest(
    req,
    res,
    `/external/tasks?email=${encodeURIComponent(req.query.email || "")}`,
    "GET",
  ),
);

// POST /api/proman/timelog
router.post("/timelog", (req, res) =>
  proxyRequest(req, res, "/external/timelog", "POST", req.body),
);

// PATCH /api/proman/task/:id/status
router.patch("/task/:id/status", (req, res) =>
  proxyRequest(
    req,
    res,
    `/external/task/${encodeURIComponent(req.params.id)}/status`,
    "PATCH",
    req.body,
  ),
);

export default router;
