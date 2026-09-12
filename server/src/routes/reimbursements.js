import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// GET /api/reimbursements — same pattern as GET /api/leaves: pagination
// is OPT-IN via ?page=. No ?page= at all -> old plain-array behavior
// (used by the staff-side Reimbursements.jsx page, unchanged). With
// ?page= (and optional ?status=) -> new paginated shape, used by the
// admin Approvals page.
router.get("/", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const status = req.query.status;
  const paginated = req.query.page !== undefined;

  const where = [];
  const params = [];
  if (!isAdmin) { params.push(req.user.id); where.push(`r.staff_id = $${params.length}`); }
  if (status)   { params.push(status);      where.push(`r.status = $${params.length}`); }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  if (!paginated) {
    const { rows } = await pool.query(
      `select r.*, p.id as staff_profile_id, p.name as staff_name
         from reimbursements r left join profiles p on p.id = r.staff_id
         ${whereSql}
        order by r.created_at desc`,
      params
    );
    const reimbursements = rows.map(({ staff_profile_id, staff_name, ...r }) => ({
      ...r,
      staff: staff_profile_id ? { id: staff_profile_id, name: staff_name } : null,
    }));
    return res.json(reimbursements);
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 18));
  const offset = (page - 1) * pageSize;

  const { rows: countRows } = await pool.query(
    `select count(*)::int as count from reimbursements r ${whereSql}`,
    params
  );
  const total = countRows[0].count;

  const pageParams = [...params, pageSize, offset];
  const { rows } = await pool.query(
    `select r.*, p.id as staff_profile_id, p.name as staff_name
       from reimbursements r left join profiles p on p.id = r.staff_id
       ${whereSql}
      order by r.created_at desc
      limit $${pageParams.length - 1} offset $${pageParams.length}`,
    pageParams
  );
  const reimbursements = rows.map(({ staff_profile_id, staff_name, ...r }) => ({
    ...r,
    staff: staff_profile_id ? { id: staff_profile_id, name: staff_name } : null,
  }));

  res.json({ reimbursements, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.post("/", async (req, res) => {
  const { category, amount, note, receipt_url } = req.body || {};
  if (!category || amount == null) return res.status(400).json({ message: "category and amount are required" });

  await pool.query(
    `insert into reimbursements (staff_id, category, amount, note, receipt_url)
     values ($1, $2, $3, $4, $5)`,
    [req.user.id, category, amount, note || null, receipt_url || null]
  );
  res.status(201).json({ ok: true });
});

router.patch("/:id/decide", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { status, rejectReason } = req.body || {};
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Invalid status" });

  await pool.query(
    "update reimbursements set status = $1, reject_reason = $2 where id = $3",
    [status, rejectReason || null, req.params.id]
  );
  res.json({ ok: true });
});

export default router;