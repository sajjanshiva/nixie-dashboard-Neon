import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { broadcastNewMessages } from "../lib/ws.js";

const router = Router();

// GET /api/messages/:taskId?limit=40
// GET /api/messages/:taskId?before=<messageId>&limit=24
//
// Chat-style pagination: with no `before`, returns the LATEST `limit`
// messages for this task (default 40), oldest-first (ready to render
// top-to-bottom). With `before` (a message id already loaded on screen),
// returns the `limit` messages (default 24) immediately preceding it —
// used for "load earlier" when the staff member scrolls up.
//
// Also returns `siblingActiveTasks` — every OTHER active task that
// shares this task's client_phone, if any. This is the group-chat
// banner data: when a client has more than one active order, every
// task's chat surfaces a one-time notice ("this client also has N other
// active order(s)") instead of the old per-message "ambiguous reply"
// claiming system, which has been removed entirely.
router.get("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { rows: taskRows } = await pool.query("select assignee_id, client_phone from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  const before = req.query.before;
  const defaultLimit = before ? 24 : 40;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));

  let cursorCreatedAt = null;
  if (before) {
    const { rows: cursorRows } = await pool.query("select created_at from messages where id = $1", [before]);
    if (!cursorRows[0]) return res.json({ messages: [], hasMore: false, siblingActiveTasks: [] });
    cursorCreatedAt = cursorRows[0].created_at;
  }

  const params = [taskId];
  let cursorSql = "";
  if (cursorCreatedAt) {
    params.push(cursorCreatedAt);
    cursorSql = `and created_at < $${params.length}`;
  }
  params.push(limit + 1); // fetch one extra to know if there's more beyond this page

  const { rows } = await pool.query(
    `select * from messages
      where task_id = $1 ${cursorSql}
      order by created_at desc
      limit $${params.length}`,
    params
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // oldest-first, ready to render

  // Sibling active tasks — only computed on the initial load (no
  // `before`), since the banner is shown once and doesn't need to be
  // recomputed every time older messages are paged in.
  let siblingActiveTasks = [];
  if (!before && task.client_phone) {
    const { rows: siblings } = await pool.query(
      `select id, title from tasks
        where client_phone = $1 and id != $2 and status != 'Complete'`,
      [task.client_phone, taskId]
    );
    siblingActiveTasks = siblings;
  }

  res.json({ messages: page, hasMore, siblingActiveTasks });
});

// POST /api/messages/send
// Body: { taskId, text, toStaff, toClient }
// The old "ambiguous reply claiming" logic (atomic claim + race-check
// before a client-directed reply) has been removed entirely — replaced
// by the group-chat mirroring in webhooksWhatsapp.js. Any assignee (or
// admin) can reply from any task's chat, anytime, without being blocked.
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
    let whatsappMessageId = null;
    try {
      const sendResult = await sendWhatsAppMessage(task.client_phone, text);
      whatsappMessageId = sendResult?.messageId || null;
    } catch (e) {
      console.error("WhatsApp send failed:", e.message);
      // Message still gets saved in the thread below — don't fail the
      // whole request just because the WhatsApp API call failed.
    }
    const { rows } = await pool.query(
      `insert into messages (task_id, kind, author_id, author_name, author_role, is_client, whatsapp_message_id, text)
       values ($1, 'client', $2, $3, $4, false, $5, $6) returning *`,
      [taskId, req.user.id, req.user.name, req.user.role, whatsappMessageId, text]
    );
    inserted.push(rows[0]);
  }

  // Push the new message(s) instantly to anyone else with this task's
  // chat open right now.
  broadcastNewMessages(taskId, inserted);

  res.json({ ok: true, messages: inserted });
});

export default router;