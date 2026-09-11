import { Router } from "express";
import crypto from "crypto";
import { pool } from "../lib/db.js";
import { broadcastNewMessages } from "../lib/ws.js";

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
// against tasks.client_phone to find which task's conversation this
// belongs to, then inserts it as a client-facing message.
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

    // Find the task whose client_phone matches this sender, comparing
    // digits-only so formatting differences don't cause a miss.
    const { rows: tasks } = await pool.query("select id, client_phone from tasks");
    const matchedTask = (tasks || []).find(
      (t) => t.client_phone && digitsOnly(t.client_phone).endsWith(digitsOnly(fromPhone).slice(-10))
    );

    if (!matchedTask) {
      console.warn(`Incoming WhatsApp message from ${fromPhone} didn't match any task's client_phone.`);
      return res.status(200).send("no matching task");
    }

    const { rows: inserted } = await pool.query(
      `insert into messages (task_id, kind, author_name, is_client, text)
       values ($1, 'client', $2, true, $3) returning *`,
      [matchedTask.id, senderName, text]
    );

    // Same as the /send route — push this instantly to anyone with this
    // task's chat currently open.
    broadcastNewMessages(matchedTask.id, inserted);

    res.status(200).send("ok");
  } catch (e) {
    console.error("Failed to process incoming WhatsApp message:", e.message);
    res.status(500).send("error");
  }
});

export default router;