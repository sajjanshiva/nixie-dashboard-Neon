import "dotenv/config";
import pg from "pg";

const { Pool, types } = pg;

// Postgres returns DATE and TIMESTAMPTZ columns as native JS Date
// objects by default — but every route here was ported from Supabase,
// whose client always returned these as plain strings, and the code
// throughout does raw string operations on them (.slice(0, 10), using a
// date as an object key, string comparisons like date >= '2026-01-01').
// Forcing both back to strings here, once, centrally, instead of
// chasing this as a bug in every single route.
types.setTypeParser(1082, (val) => val); // DATE -> 'YYYY-MM-DD' (already pg's raw wire format)
types.setTypeParser(1184, (val) => new Date(val).toISOString()); // TIMESTAMPTZ -> ISO string

function isRetryablePgError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  if (/^(08|57P)/.test(code)) return true;
  const msg = String(err.message || err);
  return /terminat|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ssl|Connection ended|connection error|connect E|timeout|the database system is starting|Client has encountered a connection error|sorry, too many clients/i.test(msg);
}

// Neon requires SSL. The pooled connection string (DATABASE_URL) is what
// the app uses for normal request-time queries — it's routed through
// PgBouncer, built for many short-lived connections like an Express API.
//
// idleTimeoutMillis is kept shorter than Neon's idle disconnect so we
// recycle clients ourselves instead of handing a request a dead socket.
// Without pool.on("error"), an idle-client disconnect is an uncaught
// exception that kills the Render process and surfaces as a 502.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});

pool.on("error", (err) => {
  console.error("Idle Postgres client error (ignored):", err.message);
});

const rawQuery = pool.query.bind(pool);
pool.query = async function queryWithRetry(text, params) {
  try {
    return await rawQuery(text, params);
  } catch (err) {
    if (!isRetryablePgError(err)) throw err;
    console.warn("Retrying Postgres query after connection error:", err.message);
    return rawQuery(text, params);
  }
};

// Convenience wrapper — most routes just need `query(sql, params)` and
// don't need to manage a client/connection themselves.
export async function query(text, params) {
  return pool.query(text, params);
}

// Forgot-password was added after the original schema, so live databases
// may not have these columns yet. Idempotent — safe to run on every boot.
export async function ensurePasswordResetColumns() {
  await pool.query(`
    alter table profiles
      add column if not exists reset_token text,
      add column if not exists reset_token_expires_at timestamptz
  `);
  await pool.query(`
    create unique index if not exists profiles_reset_token_uidx
      on profiles (reset_token)
      where reset_token is not null
  `);
}
