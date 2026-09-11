import { pool } from "./db.js";
import { sendPush } from "./webpush.js";

// Creates a notification row (drives the bell) AND sends a real push
// notification, in one call — the direct replacement for the 5 Supabase
// triggers + pg_net. relatedTaskId/relatedLeadId let a later
// reassignment find and clear this specific notification (see
// clearAssignmentNotifications below). skipPush is used when the
// recipient is already actively viewing the relevant chat (WhatsApp
// reply case) — the bell still logs it, but a redundant push is skipped.
export async function notifyUser(userId, text, link, { relatedTaskId = null, relatedLeadId = null, skipPush = false } = {}) {
  await pool.query(
    "insert into notifications (user_id, text, link, related_task_id, related_lead_id) values ($1, $2, $3, $4, $5)",
    [userId, text, link, relatedTaskId, relatedLeadId]
  );
  if (skipPush) return;
  try {
    await sendPush(userId, { text, link });
  } catch (err) {
    console.error("Push send failed during notifyUser:", err.message);
  }
}

export async function notifyAllAdmins(text, link) {
  const { rows } = await pool.query("select id from profiles where role = 'admin'");
  await Promise.all(rows.map((admin) => notifyUser(admin.id, text, link)));
}

// Called right before notifying a NEW assignee on a reassignment — deletes
// any still-unread notification tied to this same task/lead, so the
// previous assignee doesn't keep seeing a stale "you were assigned this"
// entry for something that's no longer theirs. Only ever targets ONE of
// relatedTaskId/relatedLeadId at a time (a notification is tied to
// exactly one or the other, never both) — passing both is harmless, each
// clause is a no-op when its id is null.
export async function clearAssignmentNotifications({ relatedTaskId = null, relatedLeadId = null } = {}) {
  if (relatedTaskId) {
    await pool.query(
      "delete from notifications where related_task_id = $1 and read = false",
      [relatedTaskId]
    );
  }
  if (relatedLeadId) {
    await pool.query(
      "delete from notifications where related_lead_id = $1 and read = false",
      [relatedLeadId]
    );
  }
}