import "dotenv/config";
import pg from "pg";

const { Pool, types } = pg;

// Postgres returns DATE and TIMESTAMPTZ columns as native JS Date
// objects by default — but every route here was ported from Supabase,
// whose client always returned these as plain strings, and the code
// throughout does raw string operations on them (.slice(0, 10), using a
// date as an object key, string comparisons like date >= '2026-01-01').
// Forcing both back to strings here, once, centrally, instead of
// chasing this as a bug in every individual route.
types.setTypeParser(1082, (val) => val); // DATE -> 'YYYY-MM-DD' (already pg's raw wire format)
types.setTypeParser(1184, (val) => new Date(val).toISOString()); // TIMESTAMPTZ -> ISO string

// Neon requires SSL. The pooled connection string (DATABASE_URL) is what
// the app uses for normal request-time queries — it's routed through
// PgBouncer, built for many short-lived connections like an Express API.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Convenience wrapper — most routes just need `query(sql, params)` and
// don't need to manage a client/connection themselves.
export async function query(text, params) {
  return pool.query(text, params);
}
