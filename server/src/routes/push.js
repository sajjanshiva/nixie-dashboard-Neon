import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// POST /api/push/subscribe
// Called by the client right after the browser grants permission and
// creates a push subscription. Mounted with requireAuth in index.js, so
// req.user is already the logged-in profile.
router.post("/subscribe", async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription) return res.status(400).json({ message: "Missing subscription" });

  try {
    await pool.query(
      "insert into push_subscriptions (user_id, subscription) values ($1, $2)",
      [req.user.id, JSON.stringify(subscription)]
    );
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
