import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

router.get("/", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const params = [];
  let sql = `
    select r.*, p.id as staff_profile_id, p.name as staff_name
      from reimbursements r left join profiles p on p.id = r.staff_id
  `;
  if (!isAdmin) {
    sql += " where r.staff_id = $1";
    params.push(req.user.id);
  }
  sql += " order by r.created_at desc";

  const { rows } = await pool.query(sql, params);
  const reimbursements = rows.map(({ staff_profile_id, staff_name, ...r }) => ({
    ...r,
    staff: staff_profile_id ? { id: staff_profile_id, name: staff_name } : null,
  }));
  res.json(reimbursements);
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
