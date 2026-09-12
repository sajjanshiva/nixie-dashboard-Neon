import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { broadcastNewMessages } from "../lib/ws.js";

const router = Router();

// Same normalization webhooksWhatsapp.js already uses for incoming
// messages — strips everything but digits and compares the last 10, so
// "+91 8867685299", "08867685299", and "8867685299" are all treated as
// the same number. FIX: the two sibling-lookup queries below used to do
// a plain exact-string match instead, which silently failed to find a
// sibling task whenever the same client's phone number was saved in a
// slightly different format on each task (e.g. one entered manually
// with a +91 prefix, one auto-filled from a Shopify order without it).
function digitsOnly(phone = "") {
  return phone.replace(/\D/g, "");
}
function phonesMatch(a, b) {
  if (!a || !b) return false;
  return digitsOnly(a).slice(-10) === digitsOnly(b).slice(-10);
}

// GET /api/messages/:taskId?limit=40
// GET /api/messages/:taskId?before=<messageId>&limit=24
//
// Chat-style pagination: with no `before`, returns the LATEST `limit`
// messages for this task (default 40), oldest-first (ready to render
// top-to-bottom). With `before` (a message id already loaded on screen),
// returns the `limit` messages (default 24) immediately preceding it —
// used for "load earlier" when the staff member scrolls up.
//
// Also returns `siblingActiveTasks` — every OTHER active task that's
// really the same client (same phone number, normalized), each with its
// assignee's name — this is the group-chat banner data ("this client
// also has N other active orders: X (handled by Y), Z (handled by W)").
// Only computed on the initial load (no `before`).
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

  let siblingActiveTasks = [];
  if (!before && task.client_phone) {
    const { rows: candidates } = await pool.query(
      `select t.id, t.title, t.client_phone, p.name as assignee_name
         from tasks t
         left join profiles p on p.id = t.assignee_id
        where t.client_phone is not null and t.id != $1 and t.status != 'Complete'`,
      [taskId]
    );
    siblingActiveTasks = candidates
      .filter((c) => phonesMatch(c.client_phone, task.client_phone))
      .map(({ client_phone, ...c }) => c); // drop the raw phone before sending to the client, not needed there
  }

  res.json({ messages: page, hasMore, siblingActiveTasks });
});

// POST /api/messages/send
// Body: { taskId, text, toStaff, toClient }
//
// Group-chat mirroring: after saving to the task you're actually typing
// in, the same message(s) are also copied into every OTHER currently
// active task that's really the same client (same phone number,
// normalized) — so a note dropped in Staff1's chat is immediately
// visible in Staff2's and Staff3's chats too, same for a client-facing
// reply. The real WhatsApp send (for a Client-tagged message) still only
// ever fires ONCE, against the task actually being sent from — mirroring
// only duplicates the chat LOG entry into sibling tasks, never sends a
// second WhatsApp message to the client.
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

  // Push the new message(s) instantly to anyone else with THIS task's
  // chat open right now.
  broadcastNewMessages(taskId, inserted);

  // Mirror the same message(s) into every OTHER currently active task
  // that's really the same client (normalized phone match — see
  // phonesMatch above) — same content, same sender, just a separate row
  // per sibling task (no re-send to WhatsApp; that already happened
  // once, above, if this was a Client-tagged message).
  if (task.client_phone && inserted.length > 0) {
    const { rows: candidates } = await pool.query(
      `select id, client_phone from tasks where client_phone is not null and id != $1 and status != 'Complete'`,
      [taskId]
    );
    const siblings = candidates.filter((c) => phonesMatch(c.client_phone, task.client_phone));

    for (const sib of siblings) {
      const mirrored = [];
      for (const m of inserted) {
        const { rows } = await pool.query(
          `insert into messages (task_id, kind, author_id, author_name, author_role, is_client, whatsapp_message_id, text)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
          [sib.id, m.kind, m.author_id, m.author_name, m.author_role, m.is_client, m.whatsapp_message_id, m.text]
        );
        mirrored.push(rows[0]);
      }
      broadcastNewMessages(sib.id, mirrored);
    }
  }

  res.json({ ok: true, messages: inserted });
});

export default router;