import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { notifyUser } from "../lib/notify.js";

const router = Router();

// GET /api/tasks?assigneeId=... — replaces the old direct-Supabase
// getTasks(). Previously RLS enforced "staff only see their own tasks"
// automatically; that check now lives here instead. Staff can't use
// assigneeId to look at someone else's tasks — it's forced to their own
// id regardless of what's passed.
router.get("/", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const assigneeId = isAdmin ? req.query.assigneeId : req.user.id;

  const params = [];
  let sql = `
    select t.*, p.id as assignee_profile_id, p.name as assignee_name
    from tasks t
    left join profiles p on p.id = t.assignee_id
  `;
  if (assigneeId) {
    sql += " where t.assignee_id = $1";
    params.push(assigneeId);
  }
  sql += " order by t.created_at desc";

  const { rows } = await pool.query(sql, params);
  // Shape it to match what the client already expects from Supabase's
  // "*, assignee:profiles(id, name)" select syntax.
  const tasks = rows.map(({ assignee_profile_id, assignee_name, ...t }) => ({
    ...t,
    assignee: assignee_profile_id ? { id: assignee_profile_id, name: assignee_name } : null,
  }));
  res.json(tasks);
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
// the app's design — tasks aren't self-service).
router.post("/", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { title, description, client_name, client_phone, due_date, links, assignee_id } = req.body || {};
  if (!title) return res.status(400).json({ message: "title is required" });

  const { rows } = await pool.query(
    `insert into tasks (title, description, client_name, client_phone, due_date, links, assignee_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [title, description || null, client_name || null, client_phone || null, due_date || null, links || null, assignee_id || null]
  );
  const task = rows[0];

  // Replaces trg_notify_task_assignee — notify immediately if created
  // with an assignee already set.
  if (assignee_id) {
    await notifyUser(assignee_id, `You were assigned: ${title}`, "/staff/my-tasks");
  }

  res.status(201).json(task);
});

// PUT /api/tasks/:id/assign — admin only. Body: { assigneeId }
router.put("/:id/assign", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { assigneeId } = req.body || {};
  const { rows } = await pool.query(
    "update tasks set assignee_id = $1, updated_at = now() where id = $2 returning *",
    [assigneeId || null, req.params.id]
  );
  const task = rows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  if (assigneeId) {
    await notifyUser(assigneeId, `You were assigned: ${task.title}`, "/staff/my-tasks");
  }

  res.json(task);
});

// POST /api/tasks/:id/complete — admin OR the assigned staff member
// (matches the old RLS rule: staff can update their own assigned task).
// Replaces the direct-Supabase markTaskComplete().
router.post("/:id/complete", async (req, res) => {
  const { rows: existing } = await pool.query("select assignee_id from tasks where id = $1", [req.params.id]);
  const task = existing[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  if (!isAdmin && task.assignee_id !== req.user.id) {
    return res.status(403).json({ message: "You don't have access to this task" });
  }

  const { rows } = await pool.query(
    "update tasks set status = 'Complete', progress = 100, updated_at = now() where id = $1 returning *",
    [req.params.id]
  );
  res.json(rows[0]);
});

// POST /api/tasks/progress
// Body: { taskId, progress }
// Routed through the backend (rather than a direct Supabase update) so the
// "client gets a WhatsApp update automatically" behavior fires from one
// single place, instead of being duplicated across every place progress
// might get changed.
router.post("/progress", async (req, res) => {
  const { taskId, progress } = req.body;
  if (!taskId || progress == null) return res.status(400).json({ message: "taskId and progress are required" });

  const { rows: taskRows } = await pool.query("select * from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  // A task previously marked Complete but then dragged back down below 100%
  // is no longer actually complete — auto-revert status here (the one place
  // progress ever changes) instead of leaving it stuck showing as Complete
  // in the Completed filter while the progress bar disagrees.
  const revertingFromComplete = task.status === "Complete" && progress < 100;
  const newStatus = revertingFromComplete ? "In Progress" : task.status;

  await pool.query(
    "update tasks set progress = $1, status = $2, updated_at = now() where id = $3",
    [progress, newStatus, taskId]
  );

  await pool.query(
    `insert into messages (task_id, kind, text) values ($1, 'system', $2)`,
    [
      taskId,
      revertingFromComplete
        ? `Progress updated to ${progress}% — task reopened (no longer marked Complete)`
        : `Progress updated to ${progress}%`,
    ]
  );

  const clientText = `📊 Progress update: your task '${task.title}' is now ${progress}% complete.`;
  try {
    await sendWhatsAppMessage(task.client_phone, clientText);
    await pool.query(
      `insert into messages (task_id, kind, author_id, author_name, author_role, is_client, text)
       values ($1, 'client', $2, $3, $4, false, $5)`,
      [taskId, req.user.id, req.user.name, req.user.role, clientText]
    );
  } catch (e) {
    console.error("WhatsApp progress update failed:", e.message);
  }

  res.json({ ok: true, progress, status: newStatus });
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

export default router;
