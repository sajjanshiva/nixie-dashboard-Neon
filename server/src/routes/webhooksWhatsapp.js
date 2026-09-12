import { Router } from "express";
import crypto from "crypto";
import { pool } from "../lib/db.js";
import { broadcastNewMessages, isUserConnectedToTask } from "../lib/ws.js";
import { notifyUser } from "../lib/notify.js";

const router = Router();

// Strips everything except digits so phone numbers stored in different
// formats ("+91 98765...", "098765...", "9876543210") can still be
// matched against what WhatsApp sends back (which is digits-only, with
// country code, no plus sign — e.g. "919876543210").
function digitsOnly(phone = "") {
  return phone.replace(/\D/g, "");
}

// GET /webhooks/whatsapp
// Meta's one-time verification handshake when you register the webhook
// URL in the developer dashboard — it calls this with a challenge value
// that must be echoed back if the verify token matches.
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Optional but recommended: verifies the request actually came from Meta,
// using your app's secret (Meta Developer App -> Settings -> Basic ->
// App Secret). If META_APP_SECRET isn't set, this is skipped — functional
// for testing, but you should set it before going anywhere near production.
function verifyMetaSignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // not configured — skip check (see comment above)
  const signature = req.get("X-Hub-Signature-256");
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// POST /webhooks/whatsapp
// Incoming WhatsApp messages from Meta. Matches the sender's phone number
// against tasks.client_phone to find every task's chat this belongs to.
//
// Group-chat design: if this client has MORE THAN ONE active task right
// now, the message is mirrored into EVERY one of them — every assigned
// staff member + admin effectively share one conversation with this
// client, same as a WhatsApp group. This applies unconditionally: there
// is no "swipe-reply to a specific message = certain match, deliver to
// just that one task" exception anymore — a reply-to-a-specific-message
// still mirrors to every active task, same as any other message. Nobody
// "claims" anything and nobody is blocked from replying.
router.post("/", async (req, res) => {
  if (!verifyMetaSignature(req)) return res.status(401).send("Invalid signature");

  const payload = JSON.parse(req.body.toString("utf8"));

  try {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // Meta also sends non-message events (delivery/read receipts) to
      // this same endpoint — nothing to do with those, just acknowledge.
      return res.status(200).send("ignored");
    }

    const fromPhone = message.from; // digits-only, with country code
    const text = message.text?.body || "[unsupported message type]";
    const senderName = value.contacts?.[0]?.profile?.name || "Client";

    // Pull every task on this phone number.
    const { rows: candidates } = await pool.query(`
      select t.id, t.title, t.client_phone, t.assignee_id, t.status
        from tasks t
       where t.client_phone is not null
    `);
    const digitsFrom = digitsOnly(fromPhone).slice(-10);
    const phoneMatches = candidates.filter(
      (t) => t.client_phone && digitsOnly(t.client_phone).endsWith(digitsFrom)
    );

    if (phoneMatches.length === 0) {
      console.warn(`Incoming WhatsApp message from ${fromPhone} didn't match any task's client_phone.`);
      return res.status(200).send("no matching task");
    }

    // Which task(s) get this message: every currently active (not
    // Complete) task on this phone number — or, if none are active
    // right now, the single most-recently-active one as a last resort
    // so the message isn't lost entirely.
    const activeMatches = phoneMatches.filter((t) => t.status !== "Complete");
    const targets = activeMatches.length > 0 ? activeMatches : [phoneMatches[0]];

    for (const t of targets) {
      const { rows: inserted } = await pool.query(
        `insert into messages (task_id, kind, author_name, is_client, text, whatsapp_message_id)
         values ($1, 'client', $2, true, $3, $4) returning *`,
        [t.id, senderName, text, message.id || null]
      );
      broadcastNewMessages(t.id, inserted);

      if (t.assignee_id) {
        const alreadyViewing = isUserConnectedToTask(t.assignee_id, t.id);
        const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        const multiOrderNote = targets.length > 1 ? " (also has another active order)" : "";
        await notifyUser(
          t.assignee_id,
          `${senderName} replied${multiOrderNote}: ${preview}`,
          "/staff/my-tasks",
          { relatedTaskId: t.id, skipPush: alreadyViewing }
        );
      }
    }

    res.status(200).send(targets.length > 1 ? "ok (mirrored to multiple active tasks)" : "ok");
  } catch (e) {
    console.error("Failed to process incoming WhatsApp message:", e.message);
    res.status(500).send("error");
  }
});

export default router;