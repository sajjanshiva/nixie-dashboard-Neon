import { pool } from "./db.js";
import { sendPush } from "./webpush.js";

// Creates a notification row (drives the bell) AND sends a real push
// notification, in one call. This is the direct replacement for what
// the 5 Supabase triggers + trigger_push_notification (pg_net) used to
// do — since Neon has no pg_net, and the code that creates these events
// (this Express server) already IS the same code that used to receive
// the webhook, there's no HTTP round-trip needed anymore: just call
// this function directly at the point the event happens.
export async function notifyUser(userId, text, link) {
  await pool.query(
    "insert into notifications (user_id, text, link) values ($1, $2, $3)",
    [userId, text, link]
  );
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
