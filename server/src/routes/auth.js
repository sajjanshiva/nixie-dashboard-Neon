import { Router } from "express";
import { pool } from "../lib/db.js";
import { verifyPassword, hashPassword, signSessionToken } from "../lib/auth.js";

const router = Router();

// POST /api/auth/login
// Body: { email, password }
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  const { rows } = await pool.query("select * from profiles where email = $1", [email]);
  const profile = rows[0];
  if (!profile) return res.status(401).json({ message: "Invalid email or password" });
  if (!profile.password_hash) return res.status(401).json({ message: "This account hasn't been activated yet — check your invite email" });

  const ok = await verifyPassword(password, profile.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid email or password" });

  const token = signSessionToken(profile.id);
  const { password_hash, invite_token, ...safeProfile } = profile;
  res.json({ token, profile: safeProfile });
});

// GET /api/auth/invite/:token  (public — no login required)
// Used by the "Accept Invite" page to show who's being invited and as
// what role, and to check the link hasn't expired, before showing the
// name/password form.
router.get("/invite/:token", async (req, res) => {
  const { rows } = await pool.query(
    "select email, role, invite_expires_at from profiles where invite_token = $1 and password_hash is null",
    [req.params.token]
  );
  const invite = rows[0];
  if (!invite) return res.status(404).json({ message: "Invite link is invalid or has already been used" });
  if (new Date(invite.invite_expires_at) < new Date()) {
    return res.status(410).json({ message: "This invite link has expired — ask an admin to remove and re-add you" });
  }
  res.json({ email: invite.email, role: invite.role });
});

// POST /api/auth/accept-invite  (public — no login required)
// Body: { token, name, password }
// Sets the invited person's name + password, clears the invite token,
// and logs them straight in (returns a session token) so they don't have
// to separately visit the login page right after.
router.post("/accept-invite", async (req, res) => {
  const { token, name, password } = req.body || {};
  if (!token || !name || !password) {
    return res.status(400).json({ message: "name, password, and a valid invite link are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  const { rows } = await pool.query(
    "select * from profiles where invite_token = $1 and password_hash is null",
    [token]
  );
  const invite = rows[0];
  if (!invite) return res.status(404).json({ message: "Invite link is invalid or has already been used" });
  if (new Date(invite.invite_expires_at) < new Date()) {
    return res.status(410).json({ message: "This invite link has expired — ask an admin to remove and re-add you" });
  }

  const passwordHash = await hashPassword(password);
  const { rows: updated } = await pool.query(
    `update profiles
       set name = $1, password_hash = $2, invite_token = null, invite_expires_at = null
       where id = $3
       returning id, name, email, role`,
    [name, passwordHash, invite.id]
  );

  const sessionToken = signSessionToken(invite.id);
  res.json({ token: sessionToken, profile: updated[0] });
});

export default router;
