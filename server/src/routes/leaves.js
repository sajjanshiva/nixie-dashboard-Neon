import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// GET /api/leaves — admin sees all, staff see only their own (matches
// the old RLS policies exactly).
//
// Pagination is OPT-IN: if the caller passes ?page=..., this returns the
// new paginated shape { leaves, total, page, pageSize, totalPages } with
// an optional ?status= filter (used by the admin Approvals page). If no
// ?page= is passed at all, this behaves exactly as before — a plain
// array, everything for that user's scope — so the staff-side Leave.jsx
// page (which just wants its own full history) keeps working untouched.
router.get("/", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const status = req.query.status; // "pending" | "approved" | "rejected" | undefined
  const paginated = req.query.page !== undefined;

  const where = [];
  const params = [];
  if (!isAdmin) { params.push(req.user.id); where.push(`l.staff_id = $${params.length}`); }
  if (status)   { params.push(status);      where.push(`l.status = $${params.length}`); }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  if (!paginated) {
    const { rows } = await pool.query(
      `select l.*, p.id as staff_profile_id, p.name as staff_name
         from leaves l left join profiles p on p.id = l.staff_id
         ${whereSql}
        order by l.created_at desc`,
      params
    );
    const leaves = rows.map(({ staff_profile_id, staff_name, ...l }) => ({
      ...l,
      staff: staff_profile_id ? { id: staff_profile_id, name: staff_name } : null,
    }));
    return res.json(leaves);
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 18));
  const offset = (page - 1) * pageSize;

  const { rows: countRows } = await pool.query(
    `select count(*)::int as count from leaves l ${whereSql}`,
    params
  );
  const total = countRows[0].count;

  const pageParams = [...params, pageSize, offset];
  const { rows } = await pool.query(
    `select l.*, p.id as staff_profile_id, p.name as staff_name
       from leaves l left join profiles p on p.id = l.staff_id
       ${whereSql}
      order by l.created_at desc
      limit $${pageParams.length - 1} offset $${pageParams.length}`,
    pageParams
  );
  const leaves = rows.map(({ staff_profile_id, staff_name, ...l }) => ({
    ...l,
    staff: staff_profile_id ? { id: staff_profile_id, name: staff_name } : null,
  }));

  res.json({ leaves, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// POST /api/leaves — any logged-in staff member, for themselves only.
// staff_id is forced to req.user.id, never taken from the request body —
// the old code let the client set it and relied on RLS to reject a lie;
// that check now has to happen here instead.
router.post("/", async (req, res) => {
  const { type, reason_category, reason, date_from, date_to } = req.body || {};
  if (!type || !date_from || !date_to) {
    return res.status(400).json({ message: "type, date_from, and date_to are required" });
  }
  await pool.query(
    `insert into leaves (staff_id, type, reason_category, reason, date_from, date_to)
     values ($1, $2, $3, $4, $5, $6)`,
    [req.user.id, type, reason_category || null, reason || null, date_from, date_to]
  );
  res.status(201).json({ ok: true });
});

// PATCH /api/leaves/:id/decide — admin only. Body: { status, rejectReason }
router.patch("/:id/decide", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { status, rejectReason } = req.body || {};
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Invalid status" });

  await pool.query(
    "update leaves set status = $1, reject_reason = $2 where id = $3",
    [status, rejectReason || null, req.params.id]
  );
  res.json({ ok: true });
});

export default router;