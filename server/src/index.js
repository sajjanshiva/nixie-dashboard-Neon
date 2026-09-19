import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";

import { requireAuth } from "./middleware/auth.js";
import { attachWebSocketServer } from "./lib/ws.js";
import { ensurePasswordResetColumns } from "./lib/db.js";
import authRoute from "./routes/auth.js";
import messagesRoute from "./routes/messages.js";
import notificationsRoute from "./routes/notifications.js";
import tasksRoute from "./routes/tasks.js";
import attendanceRoute from "./routes/attendance.js";
import teamRoute from "./routes/team.js";
import leavesRoute from "./routes/leaves.js";
import reimbursementsRoute from "./routes/reimbursements.js";
import shopifyInboxRoute from "./routes/shopifyInbox.js";
import imagekitAuthRoute from "./routes/imagekitAuth.js";
import shopifyWebhooks from "./routes/webhooksShopify.js";
import whatsappWebhooks from "./routes/webhooksWhatsapp.js";
import pushRoute from "./routes/push.js";
import settingsRoute from "./routes/settings.js";
import holidaysRoute from "./routes/holidays.js";
import performanceRoute from "./routes/performance.js";
import rolesRoute from "./routes/roles.js";

// A rejected async route (or an idle pg client error) used to kill the
// Node process. Render then serves an empty 502 for every request,
// including ones that never touched the database.
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

const app = express();

function allowedCorsOrigins() {
  const configured = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...configured, "http://localhost:5173", "http://127.0.0.1:5173"]);
}

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, server-to-server) send no Origin.
      if (!origin) return callback(null, true);
      if (allowedCorsOrigins().has(origin.replace(/\/$/, ""))) return callback(null, true);
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(null, false);
    },
  })
);

// Shopify + WhatsApp webhooks need the RAW request body (for signature
// verification), so both are mounted BEFORE express.json() and only
// apply to their own paths.
app.use("/webhooks/shopify", express.raw({ type: "application/json" }), shopifyWebhooks);
app.use("/webhooks/whatsapp", express.raw({ type: "application/json" }), whatsappWebhooks);

// Everything else uses normal JSON parsing.
app.use(express.json());

// Auth GETs are cross-origin from Vercel. Express ETags turn repeat
// visits into 304s with an empty body; fetch then fails to parse JSON
// and Shopify Inbox / Team render blank. Never cache API responses.
app.disable("etag");
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/health", (req, res) => res.json({ ok: true }));

// Login + invite-accept are public — no session exists yet at this point.
app.use("/api/auth", authRoute);

// GET /api/auth/me — used on page load to restore a session from a
// saved token (and doubles as a validity check: requireAuth rejects an
// expired/invalid token automatically).
app.get("/api/auth/me", requireAuth, (req, res) => {
  const { password_hash, invite_token, ...safeProfile } = req.user;
  res.json({ profile: safeProfile });
});

// NOTE: the old /webhooks/push/notify route (for a Supabase pg_net
// trigger) has been removed — that mechanism doesn't exist on Neon, and
// push notifications have been sent directly from application code
// (lib/notify.js) ever since the migration. Nothing was calling it.

// All routes below require a valid session (our own JWT now, not Supabase).
app.use("/api/messages", requireAuth, messagesRoute);
app.use("/api/notifications", requireAuth, notificationsRoute);
app.use("/api/tasks", requireAuth, tasksRoute);
app.use("/api/attendance", requireAuth, attendanceRoute);
app.use("/api/team", requireAuth, teamRoute);
app.use("/api/leaves", requireAuth, leavesRoute);
app.use("/api/reimbursements", requireAuth, reimbursementsRoute);
app.use("/api/shopify-inbox", requireAuth, shopifyInboxRoute);
app.use("/api/imagekit-auth", requireAuth, imagekitAuthRoute);
app.use("/api/push", requireAuth, pushRoute);
app.use("/api/settings", requireAuth, settingsRoute);
app.use("/api/holidays", requireAuth, holidaysRoute);
app.use("/api/performance", requireAuth, performanceRoute);
app.use("/api/roles", requireAuth, rolesRoute);

// Wrapping Express in a plain http.Server (instead of just app.listen)
// so the WebSocket server can attach to the same port and handle the
// "upgrade" requests browsers send when opening a WebSocket — Express
// alone has no concept of this, it only understands normal HTTP.
const server = http.createServer(app);
attachWebSocketServer(server);

// Express 4 does not catch rejected promises from async route handlers.
// Without this, a thrown query error sends no response (and no CORS
// headers), which the browser surfaces as "Failed to fetch".
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Something went wrong — try again" });
});

const port = process.env.PORT || 5000;

try {
  await ensurePasswordResetColumns();
} catch (err) {
  console.error("Failed to ensure password-reset columns:", err.message);
}

server.listen(port, () => console.log(`Nixie Dashboard server running on http://localhost:${port}`));