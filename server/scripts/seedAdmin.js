import "dotenv/config";
import { pool } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/auth.js";

// Idempotent: safe to run this multiple times (e.g. on every server boot)
// — it only creates the admin account if one doesn't already exist for
// that email. Rewritten for Neon: previously this called Supabase's
// Admin API to create the user + auth account; now it hashes the
// password itself and inserts the row directly.
async function seedAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const { rows: existing } = await pool.query("select id from profiles where email = $1", [ADMIN_EMAIL]);
  if (existing[0]) {
    console.log(`Admin ${ADMIN_EMAIL} already exists — skipping.`);
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await pool.query(
    `insert into profiles (name, email, role, password_hash)
     values ($1, $2, 'admin', $3)`,
    [ADMIN_NAME || "Admin", ADMIN_EMAIL, passwordHash]
  );

  console.log(`Admin account created: ${ADMIN_EMAIL}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Failed to seed admin:", err.message);
  process.exit(1);
});
