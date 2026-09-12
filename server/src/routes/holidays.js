import { Router } from "express";
import { pool } from "../lib/db.js";

const router = Router();

// GET /api/holidays?year=2026 — anyone logged in can read (staff needs
// to see holidays too, to know why check-in is blocked that day).
router.get("/", async (req, res) => {
  const { year } = req.query;
  const params = [];
  let sql = "select * from holidays";
  if (year) {
    sql += " where date >= $1 and date <= $2";
    params.push(`${year}-01-01`, `${year}-12-31`);
  }
  sql += " order by date";

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/holidays — admin only. Body: { date: "2026-10-02", name: "Gandhi Jayanti" }
// Also used to EDIT an existing holiday — upsert on the date.
router.post("/", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { date, name } = req.body || {};
  if (!date || !name) return res.status(400).json({ message: "date and name are required" });

  try {
    const { rows } = await pool.query(
      `insert into holidays (date, name, source) values ($1, $2, 'custom')
       on conflict (date) do update set name = excluded.name
       returning *`,
      [date, name]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/holidays/:date — admin only. Removes a holiday (national or custom).
router.delete("/:date", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  try {
    await pool.query("delete from holidays where date = $1", [req.params.date]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetches India's national holidays live from Calendarific for any
// year, indefinitely — replaces the old hardcoded 2024-2027 list.
// Returns { list, usedFallback } — usedFallback tells the caller
// whether this is real Calendarific data or the small hardcoded
// last-resort list (no API key configured, the API request failed, or
// it came back with zero usable "National holiday" entries) — so the
// admin isn't misled into thinking a fallback response is real,
// complete India holiday data.
async function fetchCalendarificHolidays(year, country) {
  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) {
    console.warn("CALENDARIFIC_API_KEY not set — using a small generic fallback list instead.");
    return { list: getGenericFallbackHolidays(year), usedFallback: true };
  }

  try {
    const resp = await fetch(
      `https://calendarific.com/api/v2/holidays?api_key=${apiKey}&country=${country}&year=${year}`
    );
    if (!resp.ok) throw new Error(`Calendarific request failed: ${resp.status}`);

    const data = await resp.json();
    const holidays = data?.response?.holidays || [];

    const list = holidays
      .filter((h) => Array.isArray(h.type) && h.type.includes("National holiday"))
      .map((h) => ({ date: h.date?.iso?.slice(0, 10), name: h.name }))
      .filter((h) => h.date && h.name);

    if (list.length > 0) return { list, usedFallback: false };

    console.warn(`Calendarific returned no "National holiday" entries for ${country} ${year} — using fallback list.`);
    return { list: getGenericFallbackHolidays(year), usedFallback: true };
  } catch (err) {
    console.error("Calendarific fetch failed, using generic fallback:", err.message);
    return { list: getGenericFallbackHolidays(year), usedFallback: true };
  }
}

// Last-resort fallback — only used if CALENDARIFIC_API_KEY isn't set at
// all, the live request genuinely fails, or it returns nothing usable.
// Not year-limited like the old hardcoded table was, since these are
// all fixed-date holidays (same date every year) rather than lunar/
// festival dates that shift — safe to generate for any year.
function getGenericFallbackHolidays(yearNum) {
  return [
    { date: `${yearNum}-01-01`, name: "New Year's Day" },
    { date: `${yearNum}-01-26`, name: "Republic Day" },
    { date: `${yearNum}-04-14`, name: "Dr. Ambedkar Jayanti" },
    { date: `${yearNum}-05-01`, name: "Labour Day" },
    { date: `${yearNum}-08-15`, name: "Independence Day" },
    { date: `${yearNum}-10-02`, name: "Mahatma Gandhi Jayanti" },
    { date: `${yearNum}-12-25`, name: "Christmas" },
  ];
}

// POST /api/holidays/seed?year=2026&country=IN — admin only.
// Fetches/seeds that year's national holidays and pre-marks them
// (source: 'national'). Safe to run more than once — it upserts on
// date, so it won't duplicate or wipe out any admin edits made to a
// date that already exists.
router.post("/seed", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  // Explicit validation instead of letting a bad/missing value silently
  // become "the current year" — a genuinely malformed request (e.g.
  // ?year=abc) now tells the caller clearly instead of quietly seeding
  // the wrong year.
  const rawYear = req.query.year;
  const year = rawYear === undefined ? new Date().getFullYear() : Number(rawYear);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    return res.status(400).json({ message: "year must be a valid 4-digit year" });
  }

  const country = (req.query.country || "IN").toUpperCase();

  try {
    let list = [];
    let usedFallback = false;

    if (country === "IN") {
      ({ list, usedFallback } = await fetchCalendarificHolidays(year, "IN"));
    } else {
      // Unchanged for every other country — Nager.Date already has
      // real coverage outside India.
      try {
        const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
        if (resp.ok && resp.status === 200) {
          const data = await resp.json().catch(() => []);
          list = (data || []).map((h) => ({ date: h.date, name: h.localName || h.name }));
        }
      } catch {
        list = [];
      }
      if (!list.length) {
        list = getGenericFallbackHolidays(year);
        usedFallback = true;
      }
    }

    const rows = list.map((h) => ({ date: h.date, name: h.name, source: "national" }));
    if (rows.length > 0) {
      // Multi-row insert, on conflict (date) do nothing — same as the
      // old ignoreDuplicates upsert, so re-running this never wipes out
      // any admin edits already made to a date that exists. If two
      // holidays genuinely fall on the same real calendar date (this
      // does happen — e.g. Gandhi Jayanti and Dussehra both landed on
      // Oct 2, 2025), only the first one in the list is kept; admin can
      // rename that date manually if both names matter to show.
      const values = rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
      const params = rows.flatMap((r) => [r.date, r.name, r.source]);
      await pool.query(
        `insert into holidays (date, name, source) values ${values} on conflict (date) do nothing`,
        params
      );
    }

    // `usedFallback` lets the Holidays page show a visible warning
    // ("used a generic backup list — live holiday data wasn't
    // available") instead of admin assuming this was real, complete
    // India holiday data when it wasn't.
    res.json({ inserted: rows.length, usedFallback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;