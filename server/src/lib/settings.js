import { pool } from "./db.js";

// Safe defaults for every setting key
const DEFAULTS = {
  office_start_time: "09:30",
  office_end_time: "17:00",
  office_location: { lat: 0, lng: 0, radius_meters: 120 },
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
      const fallback = DEFAULTS[key] ?? null;
      // Auto-heal by attempting to insert default if the row is missing
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
