import { pool } from "../lib/db.js";
import { verifySessionToken } from "../lib/auth.js";

// Verifies our own JWT (Authorization: Bearer <token>), then loads that
// user's profile from Postgres directly. Every protected route relies on
// req.user being set correctly here — this is the real security boundary,
// not anything in the UI. (Previously this verified a Supabase session
// and used the Supabase client; now it's our own JWT + a plain query.)
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing auth token" });

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }

  const { rows } = await pool.query("select * from profiles where id = $1", [payload.sub]);
  const profile = rows[0];
  if (!profile) return res.status(401).json({ message: "No profile found for this user" });
  if (!profile.password_hash) return res.status(401).json({ message: "Account not yet activated" });

  // NOTE: activated_at is intentionally NOT stamped here anymore. Per
  // the decision made during migration planning, it now marks a staff
  // member's FIRST CHECK-IN, not their first login/password-set — so
  // it's stamped in routes/attendance.js on check-in instead of here.

  req.user = profile; // { id, name, email, role, activated_at, ... }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ message: `Requires ${role} role` });
    next();
  };
}
