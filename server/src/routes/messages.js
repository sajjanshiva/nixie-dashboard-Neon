import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { broadcastNewMessages } from "../lib/ws.js";

const router = Router();

// GET /api/messages/:taskId
// Replaces the old direct-Supabase getMessages() — the client now goes
// through the backend for this, same as everything else post-migration.
router.get("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { rows: taskRows } = await pool.query("select assignee_id from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  const { rows } = await pool.query(
    "select * from messages where task_id = $1 order by created_at asc",
    [taskId]
  );
  res.json(rows);
});

// POST /api/messages/send
// Body: { taskId, text, toStaff, toClient }
// The 2-toggle composer rule lives here: at least one of toStaff/toClient
// must be true (also enforced on the frontend, but never trust the client).
router.post("/send", async (req, res) => {
  const { taskId, text, toStaff, toClient } = req.body;
  if (!taskId || !text?.trim() || (!toStaff && !toClient)) {
    return res.status(400).json({ message: "taskId, text, and at least one of toStaff/toClient are required" });
  }

  const { rows: taskRows } = await pool.query("select * from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  const inserted = [];
  if (toStaff) {
    const { rows } = await pool.query(
      `insert into messages (task_id, kind, author_id, author_name, author_role, text)
       values ($1, 'staff', $2, $3, $4, $5) returning *`,
      [taskId, req.user.id, req.user.name, req.user.role, text]
    );
    inserted.push(rows[0]);
  }
  if (toClient) {
    const { rows } = await pool.query(
      `insert into messages (task_id, kind, author_id, author_name, author_role, is_client, text)
       values ($1, 'client', $2, $3, $4, false, $5) returning *`,
      [taskId, req.user.id, req.user.name, req.user.role, text]
    );
    inserted.push(rows[0]);
  }

  // Push the new message(s) instantly to anyone else with this task's
  // chat open right now (replaces the old Supabase Realtime subscription).
  broadcastNewMessages(taskId, inserted);

  if (toClient) {
    try {
      await sendWhatsAppMessage(task.client_phone, text);
    } catch (e) {
      console.error("WhatsApp send failed:", e.message);
      // Message is already saved in the thread — don't fail the whole
      // request just because the WhatsApp API call failed.
    }
  }

  res.json({ ok: true, messages: inserted });
});

export default router;
