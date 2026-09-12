import { pool } from "./db.js";

// Safe defaults for every setting key. office_location is deliberately
// NOT included here (see FIX #5 below) — a fabricated lat/lng would be
// actively harmful, unlike these, which are harmless placeholder values.
const DEFAULTS = {
  office_start_time: "09:30",
  office_end_time: "17:00",
  performance_weights: { punctuality: 0.4, task_on_time: 0.6 },
};

// Short in-memory cache so a burst of check-ins doesn't hammer the
// settings table with a read every time — settings change rarely.
const cache = new Map();
const TTL_MS = 30000;

export async function getSetting(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < TTL_MS) return cached.value;

  try {
    const { rows } = await pool.query("select value from settings where key = $1", [key]);
    const row = rows[0];

    if (!row || row.value === undefined || row.value === null) {
      // FIX #5: previously, a missing office_location fell back to a
      // hardcoded { lat: 0, lng: 0 } default — a real, wrong location —
      // and this auto-heal would then WRITE that fake value back into
      // the database, making the mistake permanent instead of just an
      // in-memory fallback. office_location has no entry in DEFAULTS
      // now, so `fallback` is genuinely null here and nothing gets
      // auto-inserted for it — callers (see routes/attendance.js) are
      // responsible for treating a null office_location as "not
      // configured yet" and returning a clear message, rather than
      // silently running distance math against a guess.
      const fallback = DEFAULTS[key] ?? null;
      if (fallback !== null) {
        pool.query(
          "insert into settings (key, value) values ($1, $2) on conflict (key) do nothing",
          [key, JSON.stringify(fallback)]
        ).catch(() => {});
      }
      return fallback;
    }

    cache.set(key, { value: row.value, time: Date.now() });
    return row.value;
  } catch (err) {
    console.warn(`[getSetting] Failed reading key "${key}", using default:`, err.message);
    return DEFAULTS[key] ?? null;
  }
}

export async function setSetting(key, value) {
  await pool.query(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)]
  );
  cache.delete(key); // next read picks up the fresh value
}