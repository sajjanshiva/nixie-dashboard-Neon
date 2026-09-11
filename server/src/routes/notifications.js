import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// GET /api/notifications
// Polled by the notification bell every ~20 seconds. Kept lightweight
// (5 most recent) since it's the dropdown preview, not a full history
// page.
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "select * from notifications where user_id = $1 order by created_at desc limit 5",
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/notifications/mark-read
router.post("/mark-read", async (req, res) => {
  await pool.query(
    "update notifications set read = true where user_id = $1 and read = false",
    [req.user.id]
  );
  res.json({ ok: true });
});

export default router;
