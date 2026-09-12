import { Router } from "express";
import { pool } from "../lib/db.js";
import { notifyUser, clearAssignmentNotifications } from "../lib/notify.js";

const router = Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
  next();
}

function parsePaging(req, defaultSize = 24) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// ── Orders ──────────────────────────────────────────────────────────

// GET /orders?page=1&pageSize=24
// Paginated + server-side ordered now (previously fetched every order
// in one shot). Returns { orders, total, page, pageSize, totalPages }
// instead of a plain array, same shape as GET /api/tasks.
router.get("/orders", requireAdmin, async (req, res) => {
  const { page, pageSize, offset } = parsePaging(req);

  const { rows: countRows } = await pool.query("select count(*)::int as count from shopify_orders");
  const total = countRows[0].count;

  const { rows } = await pool.query(
    `select o.*, t.id as task_id_full, t.assignee_id as task_assignee_id, p.name as task_assignee_name, t.client_phone as task_client_phone
       from shopify_orders o
       left join tasks t on t.id = o.task_id
       left join profiles p on p.id = t.assignee_id
      order by o.created_at desc
      limit $1 offset $2`,
    [pageSize, offset]
  );
  const orders = rows.map(({ task_id_full, task_assignee_id, task_assignee_name, task_client_phone, ...o }) => {
    const hasValidAssignee = Boolean(task_assignee_id && task_assignee_name);
    return {
      ...o,
      customer_phone: o.customer_phone || task_client_phone || null,
      task: task_id_full
        ? {
            id: task_id_full,
            assignee: hasValidAssignee ? { id: task_assignee_id, name: task_assignee_name } : null,
          }
        : null,
    };
  });

  res.json({ orders, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["unassigned", "assigned"].includes(status)) return res.status(400).json({ message: "Invalid status" });
  await pool.query("update shopify_orders set status = $1 where id = $2", [status, req.params.id]);
  res.json({ ok: true });
});

// POST /api/shopify-inbox/orders/:id/assign
// Body: { phone, assigneeId }
// Converts an order into a real task (or re-assigns if task already exists),
// links it back to the order, and notifies the assignee.
router.post("/orders/:id/assign", requireAdmin, async (req, res) => {
  const { phone, assigneeId } = req.body || {};
  const { rows: orderRows } = await pool.query("select * from shopify_orders where id = $1", [req.params.id]);
  const order = orderRows[0];
  if (!order) return res.status(404).json({ message: "Order not found" });

  const title = order.order_number ? `Order ${order.order_number}` : "Shopify Order";
  let task;

  if (order.task_id) {
    // If a task already exists for this order, update assignee and phone
    const { rows: updatedTasks } = await pool.query(
      `update tasks
          set assignee_id = $1,
              client_phone = coalesce($2, client_phone)
        where id = $3
      returning *`,
      [assigneeId || null, phone || null, order.task_id]
    );
    task = updatedTasks[0];
  }

  if (!task) {
    const { rows: taskRows } = await pool.query(
      `insert into tasks (title, client_name, client_phone, assignee_id, source, shopify_order_id, shopify_order_number, shopify_items, shopify_price)
       values ($1, $2, $3, $4, 'shopify_order', $5, $6, $7, $8)
       returning *`,
      [title, order.customer_name, phone, assigneeId, order.shopify_order_id, order.order_number, order.items, order.price]
    );
    task = taskRows[0];
    await pool.query("update shopify_orders set task_id = $1, status = 'assigned' where id = $2", [task.id, order.id]);
  } else {
    await pool.query("update shopify_orders set status = 'assigned' where id = $1", [order.id]);
  }

  if (assigneeId) {
    await notifyUser(assigneeId, `You were assigned: ${title}`, "/staff/my-tasks", { relatedTaskId: task.id });
  }

  const { rows: assigneeRows } = await pool.query("select id, name from profiles where id = $1", [assigneeId]);
  res.json({ ...task, assignee: assigneeRows[0] || null });
});

// ── Leads ───────────────────────────────────────────────────────────

// GET /leads?page=1&pageSize=24
// Paginated + server-side ordered now (previously fetched every lead —
// all leads for admin, or all of a staff member's leads — in one shot).
// Returns { leads, total, page, pageSize, totalPages }. Staff scoping
// (own leads only) is unchanged, it's just applied before counting too.
router.get("/leads", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const { page, pageSize, offset } = parsePaging(req);

  const whereSql = isAdmin ? "" : "where l.assignee_id = $1";
  const scopeParams = isAdmin ? [] : [req.user.id];

  const { rows: countRows } = await pool.query(
    `select count(*)::int as count from shopify_leads l ${whereSql}`,
    scopeParams
  );
  const total = countRows[0].count;

  const pageParams = [...scopeParams, pageSize, offset];
  const { rows } = await pool.query(
    `select l.*, p.id as assignee_profile_id, p.name as assignee_name
       from shopify_leads l left join profiles p on p.id = l.assignee_id
       ${whereSql}
       order by l.created_at desc
       limit $${pageParams.length - 1} offset $${pageParams.length}`,
    pageParams
  );
  const leads = rows.map(({ assignee_profile_id, assignee_name, ...l }) => {
    const hasValidAssignee = Boolean(assignee_profile_id && assignee_name);
    return {
      ...l,
      assignee_id: hasValidAssignee ? assignee_profile_id : null,
      assignee: hasValidAssignee ? { id: assignee_profile_id, name: assignee_name } : null,
      status: hasValidAssignee ? l.status : "unassigned",
    };
  });

  res.json({ leads, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.post("/leads/:id/contacted", async (req, res) => {
  const { rows } = await pool.query("select assignee_id from shopify_leads where id = $1", [req.params.id]);
  const lead = rows[0];
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  if (req.user.role !== "admin" && lead.assignee_id !== req.user.id) {
    return res.status(403).json({ message: "Not your lead" });
  }
  await pool.query(
    "update shopify_leads set status = 'contacted', contacted_at = now() where id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
});

// POST /api/shopify-inbox/leads/:id/assign — admin only. Body: { assigneeId }
// Replaces trg_notify_lead_assigned for this path.
router.post("/leads/:id/assign", requireAdmin, async (req, res) => {
  const { assigneeId } = req.body || {};
  const { rows } = await pool.query(
    "update shopify_leads set assignee_id = $1, status = $2 where id = $3 returning *",
    [assigneeId || null, assigneeId ? "assigned" : "unassigned", req.params.id]
  );
  const lead = rows[0];
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  // Same stale-notification cleanup as task reassignment.
  await clearAssignmentNotifications({ relatedLeadId: lead.id });

  if (assigneeId) {
    const leadNum = (lead.lead_number || "").replace(/^#/, "");
    const msg = leadNum
      ? `You were assigned lead: ${lead.name || "Customer"} (#${leadNum})`
      : `You were assigned lead: ${lead.name || "Customer"}`;
    await notifyUser(assigneeId, msg, "/staff/my-leads", { relatedLeadId: lead.id });
  }

  res.json({ ok: true });
});

export default router;