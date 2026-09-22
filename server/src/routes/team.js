import { Router } from "express";
import { pool } from "../lib/db.js";
import { requireRole } from "../middleware/auth.js";
import { generateInviteToken, inviteExpiryDate } from "../lib/auth.js";
import { sendInviteEmail } from "../lib/mailer.js";

const router = Router();

// Express 4 doesn't forward async rejections to the error handler on its
// own — without this, a thrown DB error hangs the request forever
// instead of returning an error (same pattern auth.js/roles.js use).
const wrap = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// GET /api/team  (admin only)
// Returns everyone — pending invites (password_hash is null) and active
// members — with a `pending: true/false` flag so the client can group
// pending-at-top, active-below as decided.
router.get("/", requireRole("admin"), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `select id, name, email, role, created_at,
            (password_hash is null) as pending
       from profiles
       order by pending desc, created_at desc`
  );
  res.json(rows);
}));

// POST /api/team/invite  (admin only)
// Body: { email, role }
// `role` is a single value — "admin", "staff", or any name from the
// admin-managed custom_roles list (e.g. "Designer"). Whatever's picked
// becomes the real, literal value of profiles.role: a custom role gets
// exactly the same access as "staff" (every permission check in this
// app is written as "not admin", never "exactly staff"), and is shown
// as-is everywhere the role/title used to be displayed.
router.post("/invite", requireRole("admin"), wrap(async (req, res) => {
  const { email, role } = req.body || {};
  if (!email || !role) return res.status(400).json({ message: "email and role are required" });

  if (role !== "admin" && role !== "staff") {
    const { rows: known } = await pool.query("select 1 from custom_roles where name = $1", [role]);
    if (!known[0]) return res.status(400).json({ message: "That role isn't in the list — add it in Settings first" });
  }

  const { rows: existing } = await pool.query("select id, password_hash from profiles where email = $1", [email]);
  if (existing[0]) {
    return res.status(409).json({
      message: existing[0].password_hash
        ? "Someone with this email is already an active team member"
        : "An invite is already pending for this email — remove it first to resend",
    });
  }

  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiryDate();

  const { rows } = await pool.query(
    `insert into profiles (email, role, invite_token, invite_expires_at)
     values ($1, $2, $3, $4)
     returning id, email, role, created_at`,
    [email, role, inviteToken, expiresAt]
  );

  const inviteUrl = `${process.env.CLIENT_ORIGIN}/accept-invite/${inviteToken}`;
  try {
    await sendInviteEmail({ to: email, role, inviteUrl });
  } catch (err) {
    // The profile row is still created even if the email fails to send —
    // admin can see it's pending and use Remove+re-add to retry, since
    // that doubles as the resend mechanism (as decided).
    console.error("Failed to send invite email:", err.message);
    return res.status(201).json({ ...rows[0], pending: true, emailWarning: "Invite created, but the email failed to send" });
  }

  res.status(201).json({ ...rows[0], pending: true });
}));

// DELETE /api/team/invite/:id  (admin only)
// Only for PENDING invites — cancels one (e.g. wrong email, or to force
// a resend by re-inviting the same address). Never allowed once the
// person has accepted and become an active member.
router.delete("/invite/:id", requireRole("admin"), wrap(async (req, res) => {
  const { rows } = await pool.query("select password_hash from profiles where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: "Not found" });
  if (rows[0].password_hash) {
    return res.status(400).json({ message: "This person has already set their password — pending invites only can be removed" });
  }
  // A still-pending invite has never logged in, so any notification rows
  // referencing them (e.g. an admin-wide notify that fired before they
  // accepted) are meaningless — clear those first so the foreign key on
  // notifications.user_id doesn't block deleting the profile below.
  await pool.query("delete from notifications where user_id = $1", [req.params.id]);
  await pool.query("delete from profiles where id = $1", [req.params.id]);
  res.json({ ok: true });
}));

export default router;