import express from "express";

const router = express.Router();

const PROMAN_BASE_URL = "https://proman.olive.in/api/tasks";
const PROMAN_API_KEY =
  process.env.HRM_PROMAN_SECRET || "olive_shared_secret_token_987654321_xyz";

// GET /api/proman/tasks
router.get("/tasks", async (req, res) => {
  try {
    const { email } = req.query;
    const response = await fetch(
      `${PROMAN_BASE_URL}/external/tasks?email=${encodeURIComponent(email || "")}`,
      {
        method: "GET",
        headers: {
          "x-hrm-key": PROMAN_API_KEY,
        },
      },
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/proman/timelog
router.post("/timelog", async (req, res) => {
  try {
    const response = await fetch(`${PROMAN_BASE_URL}/external/timelog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hrm-key": PROMAN_API_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/proman/task/:id/status
router.patch("/task/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(
      `${PROMAN_BASE_URL}/external/task/${id}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-hrm-key": PROMAN_API_KEY,
        },
        body: JSON.stringify(req.body),
      },
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
