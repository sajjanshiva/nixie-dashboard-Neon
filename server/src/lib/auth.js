import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d"; // how long a login session lasts

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false; // account has no password yet (pending invite)
  return bcrypt.compare(plain, hash);
}

// Session token — signed with our own secret, verified by every
// protected route via middleware/auth.js. Payload is intentionally
// minimal (just the id); the profile itself is always re-fetched fresh
// from the DB on each request, so role/name changes take effect
// immediately without needing to re-login.
export function signSessionToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifySessionToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET); // throws if invalid/expired
}

// Invite tokens are separate from session tokens — random opaque
// strings stored directly in profiles.invite_token, not JWTs, since
// they're single-use and looked up by exact match, not decoded.
export function generateInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function inviteExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7); // 7-day validity, as decided
  return d;
}
