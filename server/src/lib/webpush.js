import webpush from "web-push";
import { pool } from "./db.js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Sends a push to every device this user has subscribed on (laptop,
// mobile, etc. — one row per device in push_subscriptions). If a
// subscription has gone stale (browser data cleared, permission revoked,
// device uninstalled), the push service returns 404/410 — we clean those
// rows up so we don't keep retrying them forever.
export async function sendPush(userId, { text, link }) {
  let subs;
  try {
    const { rows } = await pool.query(
      "select * from push_subscriptions where user_id = $1",
      [userId]
    );
    subs = rows;
  } catch (err) {
    console.error("Failed to load push subscriptions:", err.message);
    return;
  }

  const payload = JSON.stringify({
    title: "Nixie Dashboard",
    body: text,
    link: link || "/",
  });

  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query("delete from push_subscriptions where id = $1", [sub.id]);
      } else {
        console.error("Push send failed:", err.message);
      }
    }
  }
}
