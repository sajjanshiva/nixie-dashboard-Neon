import { Router } from "express";
import { sendPush } from "../lib/webpush.js";

const router = Router();

// POST /webhooks/push/notify
// Called by the Postgres trigger on the `notifications` table (via
// pg_net) every time a new notification row is inserted — see
// supabase_notifications_and_push.sql. There's no logged-in user making
// this request (it's the database itself), so it's verified with a
// shared secret header instead of requireAuth.
router.post("/notify", async (req, res) => {
  const secret = req.get("x-push-secret");
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return res.status(401).send("Invalid secret");
  }

  const { user_id, text, link } = req.body || {};
  if (!user_id || !text) return res.status(400).send("Missing user_id or text");

  await sendPush(user_id, { text, link });
  res.status(200).send("ok");
});

export default router;