import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// POST /api/push/subscribe
// Called by the client right after the browser grants permission and
// creates a push subscription. Mounted with requireAuth in index.js, so
// req.user is already the logged-in profile.
router.post("/subscribe", async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint) return res.status(400).json({ message: "Missing subscription" });

  try {
    // Dedupe on (user, device) — a device's push endpoint is a stable
    // identifier for that specific browser/device. If this exact device
    // is already subscribed, update the row in place (keys can rotate)
    // instead of inserting a duplicate — this is what makes it safe to
    // show "Enable notifications" even when we're not 100% sure this
    // device already has an active subscription (see NotificationBell.jsx).
    const { rows: existing } = await pool.query(
      "select id from push_subscriptions where user_id = $1 and subscription->>'endpoint' = $2",
      [req.user.id, subscription.endpoint]
    );
    if (existing[0]) {
      await pool.query(
        "update push_subscriptions set subscription = $1 where id = $2",
        [JSON.stringify(subscription), existing[0].id]
      );
    } else {
      await pool.query(
        "insert into push_subscriptions (user_id, subscription) values ($1, $2)",
        [req.user.id, JSON.stringify(subscription)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/push/unsubscribe
// Removes this device's subscription (e.g. user turns notifications off).
router.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ message: "Missing endpoint" });

  try {
    await pool.query(
      "delete from push_subscriptions where user_id = $1 and subscription->>'endpoint' = $2",
      [req.user.id, endpoint]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;