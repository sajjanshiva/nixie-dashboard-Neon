import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { notifyUser, clearAssignmentNotifications } from "../lib/notify.js";
import { broadcastNewMessages } from "../lib/ws.js";

const router = Router();

// GET /api/tasks?assigneeId=...&status=...&unassigned=true&page=1&pageSize=24
// Paginated + filtered server-side. Returns { tasks, total, page,
// pageSize, totalPages } instead of a plain array.
//
// `unassigned=true` is a new filter — tasks with no assignee at all
// (assignee_id is null). It's independent of `status` (a task can be
// unassigned AND "In Progress", for instance) but in practice the admin
// All Tasks page only ever sends one filter at a time, treating
// "Unassigned" as its own pill alongside All/In Progress/Complete.
router.get("/", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const assigneeId = isAdmin ? req.query.assigneeId : req.user.id;
  const status = req.query.status; // "In Progress" | "Complete" | "On Hold" | undefined (= all)
  const unassignedOnly = req.query.unassigned === "true";
  const month = req.query.month ? req.query.month.trim() : "";
  const search = req.query.search ? req.query.search.trim() : "";
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 24));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (assigneeId)     { params.push(assigneeId); where.push(`t.assignee_id = $${params.length}`); }
  if (status)         { params.push(status);     where.push(`t.status = $${params.length}`); }
  if (unassignedOnly) { where.push(`t.assignee_id is null`); }
  if (month) {
    params.push(`${month}%`);
    where.push(`(to_char(t.created_at, 'YYYY-MM') like $${params.length} or t.due_date like $${params.length})`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(t.client_name ilike $${params.length} or t.client_phone ilike $${params.length} or t.title ilike $${params.length})`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  const { rows: countRows } = await pool.query(`select count(*)::int as count from tasks t ${whereSql}`, params);
  const total = countRows[0].count;

  const pageParams = [...params, pageSize, offset];
  const { rows } = await pool.query(
    `select t.*, p.id as assignee_profile_id, p.name as assignee_name
       from tasks t
       left join profiles p on p.id = t.assignee_id
       ${whereSql}
       order by t.created_at desc
       limit $${pageParams.length - 1} offset $${pageParams.length}`,
    pageParams
  );

  const tasks = rows.map(({ assignee_profile_id, assignee_name, ...t }) => ({
    ...t,
    assignee: assignee_profile_id ? { id: assignee_profile_id, name: assignee_name } : null,
  }));

  res.json({ tasks, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// GET /api/tasks/:id
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `select t.*, p.id as assignee_profile_id, p.name as assignee_name
       from tasks t left join profiles p on p.id = t.assignee_id
      where t.id = $1`,
    [req.params.id]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  if (!isAdmin && row.assignee_id !== req.user.id) {
    return res.status(403).json({ message: "You don't have access to this task" });
  }

  const { assignee_profile_id, assignee_name, ...t } = row;
  res.json({ ...t, assignee: assignee_profile_id ? { id: assignee_profile_id, name: assignee_name } : null });
});

// POST /api/tasks — admin only (manual task creation via Team page, per
// the app's design — tasks aren't self-service). An assignee is now
// required — previously a task could be created with nobody assigned at
// all, silently invisible to any staff member; enforced here, not just
// in the form, since the client can't be trusted alone.
router.post("/", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { title, description, client_name, client_phone, due_date, links, assignee_id } = req.body || {};
  if (!title) return res.status(400).json({ message: "title is required" });
  if (!assignee_id) return res.status(400).json({ message: "An assignee is required" });

  const { rows } = await pool.query(
    `insert into tasks (title, description, client_name, client_phone, due_date, links, assignee_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [title, description || null, client_name || null, client_phone || null, due_date || null, links || null, assignee_id]
  );
  const task = rows[0];

  // Replaces trg_notify_task_assignee.
  await notifyUser(assignee_id, `You were assigned: ${title}`, "/staff/my-tasks", { relatedTaskId: task.id });

  res.status(201).json(task);
});

// PUT /api/tasks/:id/assign — admin only. Body: { assigneeId }
// On an actual reassignment (task already had a different assignee, or
// is being unassigned), this now: clears any stale unread notification
// the previous assignee still had for this task, logs a system message
// in the chat so the handoff is visible in the task's history (the
// conversation itself is untouched — the new assignee can see everything
// that happened before, this just marks where the handoff occurred), and
// notifies the new assignee.
router.put("/:id/assign", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { assigneeId } = req.body || {};

  const { rows: beforeRows } = await pool.query(
    "select id, title, assignee_id from tasks where id = $1",
    [req.params.id]
  );
  const before = beforeRows[0];
  if (!before) return res.status(404).json({ message: "Task not found" });

  const { rows } = await pool.query(
    "update tasks set assignee_id = $1, updated_at = now() where id = $2 returning *",
    [assigneeId || null, req.params.id]
  );
  const task = rows[0];

  // Clear any stale unread "you were assigned this" notification before
  // the new one (if any) gets created below.
  await clearAssignmentNotifications({ relatedTaskId: task.id });

  // Only log a handoff message for an ACTUAL reassignment — i.e. this
  // task already had a different assignee. A first-time assignment from
  // "unassigned" isn't a handoff, so no system message there.
  const isRealReassignment = before.assignee_id && before.assignee_id !== assigneeId;
  if (isRealReassignment) {
    const [{ rows: oldP }, { rows: newP }] = await Promise.all([
      pool.query("select name from profiles where id = $1", [before.assignee_id]),
      assigneeId ? pool.query("select name from profiles where id = $1", [assigneeId]) : Promise.resolve({ rows: [] }),
    ]);
    const oldName = oldP[0]?.name || "a staff member";
    const handoffText = assigneeId
      ? `Task reassigned from ${oldName} to ${newP[0]?.name || "a staff member"}`
      : `Task unassigned from ${oldName}`;

    const { rows: systemMsgRows } = await pool.query(
      `insert into messages (task_id, kind, text) values ($1, 'system', $2) returning *`,
      [task.id, handoffText]
    );
    // Same as any other new message — push it live to anyone with this
    // task's chat currently open, not just on next page load.
    broadcastNewMessages(task.id, systemMsgRows);
  }

  if (assigneeId) {
    await notifyUser(assigneeId, `You were assigned: ${task.title}`, "/staff/my-tasks", { relatedTaskId: task.id });
  }

  res.json(task);
});

// POST /api/tasks/:id/complete — admin OR the assigned staff member
// (matches the old RLS rule: staff can update their own assigned task).
// Replaces the direct-Supabase markTaskComplete().
router.post("/:id/complete", async (req, res) => {
  const { rows: existing } = await pool.query("select * from tasks where id = $1", [req.params.id]);
  const task = existing[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  if (!isAdmin && task.assignee_id !== req.user.id) {
    return res.status(403).json({ message: "You don't have access to this task" });
  }

  const { rows } = await pool.query(
    "update tasks set status = 'Complete', progress = 100, completed_at = now(), updated_at = now() where id = $1 returning *",
    [req.params.id]
  );
  const updatedTask = rows[0];

  // Log system message
  const systemText = "Task marked Complete";
  const { rows: sysRows } = await pool.query(
    `insert into messages (task_id, kind, text) values ($1, 'system', $2) returning *`,
    [req.params.id, systemText]
  );

  // Send WhatsApp completion message to client if phone is present
  const clientText = `🎉 Great news — your order '${task.title}' is complete!`;
  let clientMsgRow = null;
  if (task.client_phone) {
    try {
      const sendResult = await sendWhatsAppMessage(task.client_phone, clientText);
      const { rows: cRows } = await pool.query(
        `insert into messages (task_id, kind, author_id, author_name, author_role, is_client, whatsapp_message_id, text)
         values ($1, 'client', $2, $3, $4, false, $5, $6) returning *`,
        [req.params.id, req.user.id, req.user.name, req.user.role, sendResult?.messageId || null, clientText]
      );
      clientMsgRow = cRows[0];
    } catch (e) {
      console.error("WhatsApp completion update failed:", e.message);
    }
  }

  // Broadcast messages via WebSocket if active
  const newMsgs = [sysRows[0], clientMsgRow].filter(Boolean);
  if (newMsgs.length > 0) {
    broadcastNewMessages(req.params.id, newMsgs);
  }

  res.json(updatedTask);
});

// POST /api/tasks/progress
// Body: { taskId, progress, stage, status }
// Updates task stage and progress, sets task status accordingly,
// logs system chat message, and notifies client via WhatsApp.
router.post("/progress", async (req, res) => {
  const { taskId, progress, stage, status: requestedStatus } = req.body;
  if (!taskId) return res.status(400).json({ message: "taskId is required" });

  const { rows: taskRows } = await pool.query("select * from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  let newStatus = requestedStatus || task.status;
  let newProgress = progress != null ? Number(progress) : task.progress;
  let newStage = stage || task.stage;

  if (stage === "On Hold" || requestedStatus === "On Hold") {
    newStatus = "On Hold";
    newStage = "On Hold";
  } else if (stage === "Shipped" || (progress != null && Number(progress) >= 100)) {
    newStatus = "Complete";
    newProgress = 100;
    newStage = stage || "Shipped";
  } else {
    newStatus = "In Progress";
    if (stage === "Fabric/Material Sourcing") newProgress = 20;
    else if (stage === "Outfit in Production") newProgress = 40;
    else if (stage === "QC & Packaging") newProgress = 60;
    else if (stage === "Ready for Dispatch") newProgress = 80;
  }

  if (newStatus === "Complete") {
    await pool.query(
      "update tasks set progress = $1, status = $2, stage = $3, completed_at = coalesce(completed_at, now()), updated_at = now() where id = $4",
      [newProgress, newStatus, newStage, taskId]
    );
  } else {
    await pool.query(
      "update tasks set progress = $1, status = $2, stage = $3, updated_at = now() where id = $4",
      [newProgress, newStatus, newStage, taskId]
    );
  }

  let systemText;
  let clientText;
  if (newStatus === "On Hold") {
    systemText = `Task placed On Hold`;
    clientText = `⏸️ Status update: Your order '${task.title}' has been put On Hold.`;
  } else if (newStatus === "Complete") {
    systemText = `Stage updated to Shipped — task marked Complete`;
    clientText = `🎉 Great news — your order '${task.title}' has been Shipped!`;
  } else {
    systemText = `Stage updated to ${newStage || "In Progress"} (${newProgress}%)`;
    clientText = `📊 Order update: your order '${task.title}' is now in '${newStage || "In Progress"}' (${newProgress}% complete).`;
  }

  await pool.query(
    `insert into messages (task_id, kind, text) values ($1, 'system', $2)`,
    [taskId, systemText]
  );

  try {
    const sendResult = await sendWhatsAppMessage(task.client_phone, clientText);
    await pool.query(
      `insert into messages (task_id, kind, author_id, author_name, author_role, is_client, whatsapp_message_id, text)
       values ($1, 'client', $2, $3, $4, false, $5, $6)`,
      [taskId, req.user.id, req.user.name, req.user.role, sendResult?.messageId || null, clientText]
    );
  } catch (e) {
    console.error("WhatsApp progress update failed:", e.message);
  }

  res.json({ ok: true, progress: newProgress, status: newStatus, stage: newStage });
});

// POST /api/tasks/undo-complete
// Body: { taskId }
// Explicit "un-complete" action — reverts a task's status back to
// "In Progress" without touching its progress value (e.g. admin/staff
// clicked Mark Complete by mistake). No client WhatsApp message is sent
// for this — it's an internal correction, not a real progress update.
router.post("/undo-complete", async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ message: "taskId is required" });

  const { rows: taskRows } = await pool.query("select * from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  if (task.status !== "Complete") return res.json({ ok: true, status: task.status });

  await pool.query(
    "update tasks set status = 'In Progress', updated_at = now() where id = $1",
    [taskId]
  );

  await pool.query(
    `insert into messages (task_id, kind, text) values ($1, 'system', 'Marked Complete was undone — task reopened')`,
    [taskId]
  );

  res.json({ ok: true, status: "In Progress" });
});

// DELETE /api/tasks/:id — admin only, and ONLY for manually created
// tasks. Shopify-order-derived tasks represent real customer orders —
// deleting the task shouldn't be how you undo a wrong assignment (use
// PUT /:id/assign instead); the source check below is a server-side
// safety net even though the UI only shows a delete button for manual
// tasks in the first place, in case that condition is ever bypassed.
// Chat messages cascade-delete automatically (see schema: messages ->
// task_id references tasks(id) on delete cascade).
router.delete("/:id", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { rows } = await pool.query("select source from tasks where id = $1", [req.params.id]);
  const task = rows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });
  if (task.source !== "manual") {
    return res.status(400).json({ message: "Only manually created tasks can be deleted — reassign Shopify-order tasks instead" });
  }

  await pool.query("delete from tasks where id = $1", [req.params.id]);
  res.json({ ok: true });
});

export default router;