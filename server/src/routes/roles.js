import { Router } from "express";
import { pool } from "../lib/db.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// Express 4 doesn't forward async rejections to the error handler on its
// own (same reason auth.js has this) — without it, a DB hiccup here would
// hang the request instead of returning the global 500 handler's response.
const wrap = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// GET /api/roles  (admin only)
// The admin-managed list of custom display titles ("Designer", "Tailor",
// ...) — used both by the Settings "Manage Roles" section and the invite
// dropdown on the Team page. Admin/Staff are NOT in this table — they're
// the fixed access levels, not custom titles, and are handled separately.
router.get("/", requireRole("admin"), wrap(async (req, res) => {
  const { rows } = await pool.query("select id, name, created_at from custom_roles order by name asc");
  res.json(rows);
}));

// POST /api/roles  (admin only)
// Body: { name }
router.post("/", requireRole("admin"), wrap(async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ message: "Role name is required" });
  if (["admin", "staff"].includes(name.toLowerCase())) {
    return res.status(400).json({ message: "Admin and Staff are already built in — pick a different name" });
  }
  try {
    const { rows: dupe } = await pool.query("select 1 from custom_roles where lower(name) = lower($1)", [name]);
    if (dupe[0]) return res.status(409).json({ message: "That role already exists" });
    const { rows } = await pool.query(
      "insert into custom_roles (name) values ($1) returning id, name, created_at",
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "That role already exists" });
    throw err;
  }
}));

// DELETE /api/roles/:id  (admin only)
// Removing a role here only removes it from the picker going forward —
// profiles.role is plain text, not a foreign key to this table, so
// anyone who already has this role keeps it exactly as-is, fully
// functional. It just can't be picked for new invites anymore once
// it's gone from this list.
router.delete("/:id", requireRole("admin"), wrap(async (req, res) => {
  await pool.query("delete from custom_roles where id = $1", [req.params.id]);
  res.json({ ok: true });
}));

export default router;