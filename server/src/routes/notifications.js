import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// GET /api/notifications
// Polled by the notification bell every ~20 seconds. Kept lightweight
// (5 most recent) since it's the dropdown preview, not a full history
// page. Unchanged.
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "select * from notifications where user_id = $1 order by created_at desc limit 5",
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/notifications/all?page=1&pageSize=24
// Full paginated history, for the "View all" page linked from the bell
// dropdown. Returns { notifications, total, page, pageSize, totalPages }.
router.get("/all", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 24));
  const offset = (page - 1) * pageSize;

  const { rows: countRows } = await pool.query(
    "select count(*)::int as count from notifications where user_id = $1",
    [req.user.id]
  );
  const total = countRows[0].count;

  const { rows } = await pool.query(
    `select * from notifications where user_id = $1
      order by created_at desc
      limit $2 offset $3`,
    [req.user.id, pageSize, offset]
  );

  res.json({ notifications: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
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