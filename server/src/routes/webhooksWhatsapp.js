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
    const replyContextId = message.context?.id || null; // set if the client swipe-replied to a specific message

    // Pull every task on this phone number, plus how recently each one
    // had actual chat activity (falls back to the task's own created_at
    // if it has no messages yet) — used for the "most recently active"
    // fallback heuristic below.
    const { rows: candidates } = await pool.query(`
      select t.id, t.title, t.client_phone, t.assignee_id, t.status,
             greatest(t.created_at, coalesce(
               (select max(created_at) from messages where task_id = t.id), t.created_at
             )) as last_activity
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

    // ── Tier 1: certain match — client swipe-replied to a specific
    //    message we sent. Whatever task that original message belongs
    //    to is the answer, with no guessing at all, regardless of how
    //    many other tasks share this phone number. ──
    let matchedTask = null;
    if (replyContextId) {
      const { rows: originRows } = await pool.query(
        "select task_id from messages where whatsapp_message_id = $1 limit 1",
        [replyContextId]
      );
      if (originRows[0]) {
        matchedTask = phoneMatches.find((t) => t.id === originRows[0].task_id) || null;
      }
    }

    // ── Tier 2/3: no certain match — fall back to the heuristic ──
    let ambiguousCandidates = null;
    if (!matchedTask) {
      const activeMatches = phoneMatches.filter((t) => t.status !== "Complete");
      if (activeMatches.length === 1) {
        matchedTask = activeMatches[0];
      } else if (activeMatches.length > 1) {
        // 2+ active tasks on this phone number and no reply-context to
        // disambiguate — this is the genuinely ambiguous case. Sort by
        // most recently active; the top one is used as the "primary"
        // notification target, but the message gets linked into EVERY
        // active candidate below, not just this one.
        ambiguousCandidates = [...activeMatches].sort(
          (a, b) => new Date(b.last_activity) - new Date(a.last_activity)
        );
        matchedTask = ambiguousCandidates[0];
      } else {
        // No active tasks at all on this number (all complete) — still
        // route it somewhere rather than lose the message entirely; most
        // recently active completed task is the best remaining guess.
        matchedTask = [...phoneMatches].sort(
          (a, b) => new Date(b.last_activity) - new Date(a.last_activity)
        )[0];
      }
    }

    if (ambiguousCandidates) {
      // ── Linked copies across every active candidate task ──
      const { rows: ambRows } = await pool.query(
        "insert into ambiguous_whatsapp_replies (phone, text, sender_name) values ($1, $2, $3) returning id",
        [fromPhone, text, senderName]
      );
      const ambiguousReplyId = ambRows[0].id;

      for (const t of ambiguousCandidates) {
        const { rows: inserted } = await pool.query(
          `insert into messages (task_id, kind, author_name, is_client, text, ambiguous_reply_id)
           values ($1, 'client', $2, true, $3, $4) returning *`,
          [t.id, senderName, text, ambiguousReplyId]
        );
        broadcastNewMessages(t.id, inserted);

        if (t.assignee_id) {
          const alreadyViewing = isUserConnectedToTask(t.assignee_id, t.id);
          const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
          await notifyUser(
            t.assignee_id,
            `${senderName} replied (also has another active task — check before responding): ${preview}`,
            "/staff/my-tasks",
            { relatedTaskId: t.id, skipPush: alreadyViewing }
          );
        }
      }
      return res.status(200).send("ok (ambiguous, linked to multiple tasks)");
    }

    // ── Single, non-ambiguous match (certain, or only one candidate) ──
    const { rows: inserted } = await pool.query(
      `insert into messages (task_id, kind, author_name, is_client, text)
       values ($1, 'client', $2, true, $3) returning *`,
      [matchedTask.id, senderName, text]
    );

    // Same as the /send route — push this instantly to anyone with this
    // task's chat currently open.
    broadcastNewMessages(matchedTask.id, inserted);

    // Notify the assignee — unless they're already looking at this exact
    // chat right now (they'll see the message appear live via the socket
    // above, so a push would just be redundant). The bell still logs it
    // either way, only the push notification is conditionally skipped.
    if (matchedTask.assignee_id) {
      const alreadyViewing = isUserConnectedToTask(matchedTask.assignee_id, matchedTask.id);
      const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      await notifyUser(
        matchedTask.assignee_id,
        `${senderName} replied: ${preview}`,
        "/staff/my-tasks",
        { relatedTaskId: matchedTask.id, skipPush: alreadyViewing }
      );
    }

    res.status(200).send("ok");
  } catch (e) {
    console.error("Failed to process incoming WhatsApp message:", e.message);
    res.status(500).send("error");
  }
});

export default router;