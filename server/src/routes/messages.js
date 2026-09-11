import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { broadcastNewMessages, broadcastAmbiguousResolved } from "../lib/ws.js";

const router = Router();

// GET /api/messages/:taskId
// Also brings back each message's linked ambiguous-reply state (if any)
// so the client can render the "double-check this reply" warning, or
// the "already replied elsewhere" resolved state, without a second call.
router.get("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { rows: taskRows } = await pool.query("select assignee_id from tasks where id = $1", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const isAdmin = req.user.role === "admin";
  const isAssignee = task.assignee_id === req.user.id;
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: "You don't have access to this task" });

  const { rows } = await pool.query(
    `select m.*,
            ar.claimed as ambiguous_claimed,
            ar.claimed_by_task_id as ambiguous_claimed_by_task_id,
            ar.claimed_by_user_id as ambiguous_claimed_by_user_id,
            ar.claimed_reply_text as ambiguous_claimed_reply_text,
            p.name as ambiguous_claimed_by_name,
            ct.title as ambiguous_claimed_by_task_title
       from messages m
       left join ambiguous_whatsapp_replies ar on ar.id = m.ambiguous_reply_id
       left join profiles p on p.id = ar.claimed_by_user_id
       left join tasks ct on ct.id = ar.claimed_by_task_id
      where m.task_id = $1
      order by m.created_at asc`,
    [taskId]
  );
  res.json(rows);
});

// POST /api/messages/send
// Body: { taskId, text, toStaff, toClient }
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

  // ── Ambiguous-reply claim, atomic ──────────────────────────────────
  // If this task has an unclaimed ambiguous incoming message (the same
  // client text also landed in another active task because we couldn't
  // tell which one it was about), a client-directed reply from here is
  // treated as "this is the answer to that." The UPDATE below only
  // succeeds if the row is STILL unclaimed at the exact moment it runs —
  // Postgres processes concurrent updates to the same row one at a time,
  // so if two staff reply in two different linked tasks at nearly the
  // same instant, only one of these UPDATEs can actually match
  // "claimed = false" and return a row. The other gets 0 rows back —
  // that's the race-proof guarantee: whoever's UPDATE lands first wins,
  // and the loser is stopped here, BEFORE anything is sent to WhatsApp
  // or inserted into this chat.
  let claimedAmbiguousId = null;
  if (toClient) {
    const { rows: pending } = await pool.query(
      `select ar.id from ambiguous_whatsapp_replies ar
         join messages m on m.ambiguous_reply_id = ar.id
        where m.task_id = $1 and ar.claimed = false
        order by ar.created_at desc limit 1`,
      [taskId]
    );
    if (pending[0]) {
      const { rows: claimed } = await pool.query(
        `update ambiguous_whatsapp_replies
            set claimed = true, claimed_by_task_id = $1, claimed_by_user_id = $2,
                claimed_reply_text = $3, claimed_at = now()
          where id = $4 and claimed = false
          returning id`,
        [taskId, req.user.id, text, pending[0].id]
      );
      if (claimed.length === 0) {
        // Lost the race — someone else's reply (in another linked task)
        // claimed this a moment earlier. Refuse to send a second reply.
        return res.status(409).json({
          message: "This client's message was already replied to from another task — check that task's chat for what was said.",
        });
      }
      claimedAmbiguousId = claimed[0].id;
    }
  }

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

  // If this reply just claimed an ambiguous message, tell every OTHER
  // linked task's chat live — who answered it, from where, and what
  // they said — so nobody there thinks it's still waiting on them.
  if (claimedAmbiguousId) {
    const { rows: linkedTasks } = await pool.query(
      "select distinct task_id from messages where ambiguous_reply_id = $1 and task_id != $2",
      [claimedAmbiguousId, taskId]
    );
    if (linkedTasks.length > 0) {
      broadcastAmbiguousResolved(linkedTasks.map((r) => r.task_id), {
        ambiguousReplyId: claimedAmbiguousId,
        claimedByTaskId: taskId,
        claimedByTaskTitle: task.title,
        claimedByUserName: req.user.name,
        claimedReplyText: text,
      });
    }
  }

  res.json({ ok: true, messages: inserted });
});

export default router;