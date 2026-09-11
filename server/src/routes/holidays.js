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

const INDIAN_HOLIDAYS_BY_YEAR = {
  2024: [
    { date: "2024-01-01", name: "New Year's Day" },
    { date: "2024-01-15", name: "Makar Sankranti / Pongal" },
    { date: "2024-01-26", name: "Republic Day" },
    { date: "2024-03-08", name: "Maha Shivratri" },
    { date: "2024-03-25", name: "Holi" },
    { date: "2024-03-29", name: "Good Friday" },
    { date: "2024-04-11", name: "Eid ul-Fitr" },
    { date: "2024-04-14", name: "Dr. Ambedkar Jayanti" },
    { date: "2024-05-01", name: "Labour Day" },
    { date: "2024-06-17", name: "Bakrid / Eid al-Adha" },
    { date: "2024-07-17", name: "Muharram" },
    { date: "2024-08-15", name: "Independence Day" },
    { date: "2024-08-19", name: "Raksha Bandhan" },
    { date: "2024-08-26", name: "Janmashtami" },
    { date: "2024-09-07", name: "Ganesh Chaturthi" },
    { date: "2024-10-02", name: "Mahatma Gandhi Jayanti" },
    { date: "2024-10-12", name: "Dussehra" },
    { date: "2024-10-31", name: "Diwali" },
    { date: "2024-11-15", name: "Guru Nanak Jayanti" },
    { date: "2024-12-25", name: "Christmas" },
  ],
  2025: [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-01-14", name: "Makar Sankranti / Pongal" },
    { date: "2025-01-26", name: "Republic Day" },
    { date: "2025-02-26", name: "Maha Shivratri" },
    { date: "2025-03-14", name: "Holi" },
    { date: "2025-03-31", name: "Eid ul-Fitr" },
    { date: "2025-04-14", name: "Dr. Ambedkar Jayanti" },
    { date: "2025-04-18", name: "Good Friday" },
    { date: "2025-05-01", name: "Labour Day" },
    { date: "2025-06-07", name: "Bakrid / Eid al-Adha" },
    { date: "2025-07-06", name: "Muharram" },
    { date: "2025-08-15", name: "Independence Day" },
    { date: "2025-08-16", name: "Janmashtami" },
    { date: "2025-08-27", name: "Ganesh Chaturthi" },
    { date: "2025-10-02", name: "Mahatma Gandhi Jayanti" },
    { date: "2025-10-02", name: "Dussehra / Vijayadashami" },
    { date: "2025-10-20", name: "Diwali / Deepavali" },
    { date: "2025-11-05", name: "Guru Nanak Jayanti" },
    { date: "2025-12-25", name: "Christmas" },
  ],
  2026: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-14", name: "Makar Sankranti / Pongal" },
    { date: "2026-01-26", name: "Republic Day" },
    { date: "2026-02-16", name: "Maha Shivratri" },
    { date: "2026-03-04", name: "Holi" },
    { date: "2026-03-21", name: "Eid ul-Fitr" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-04-14", name: "Dr. Ambedkar Jayanti" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-27", name: "Bakrid / Eid al-Adha" },
    { date: "2026-06-26", name: "Muharram" },
    { date: "2026-08-15", name: "Independence Day" },
    { date: "2026-08-28", name: "Raksha Bandhan" },
    { date: "2026-09-04", name: "Janmashtami" },
    { date: "2026-09-15", name: "Ganesh Chaturthi" },
    { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
    { date: "2026-10-20", name: "Dussehra / Vijayadashami" },
    { date: "2026-11-08", name: "Diwali / Deepavali" },
    { date: "2026-11-24", name: "Guru Nanak Jayanti" },
    { date: "2026-12-25", name: "Christmas" },
  ],
  2027: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-14", name: "Makar Sankranti / Pongal" },
    { date: "2027-01-26", name: "Republic Day" },
    { date: "2027-03-07", name: "Maha Shivratri" },
    { date: "2027-03-10", name: "Eid ul-Fitr" },
    { date: "2027-03-23", name: "Holi" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-04-14", name: "Dr. Ambedkar Jayanti" },
    { date: "2027-05-01", name: "Labour Day" },
    { date: "2027-05-17", name: "Bakrid / Eid al-Adha" },
    { date: "2027-07-16", name: "Muharram" },
    { date: "2027-08-15", name: "Independence Day" },
    { date: "2027-10-02", name: "Mahatma Gandhi Jayanti" },
    { date: "2027-10-09", name: "Dussehra / Vijayadashami" },
    { date: "2027-10-29", name: "Diwali / Deepavali" },
    { date: "2027-11-14", name: "Guru Nanak Jayanti" },
    { date: "2027-12-25", name: "Christmas" },
  ],
};

function getIndianHolidaysForYear(yearNum) {
  if (INDIAN_HOLIDAYS_BY_YEAR[yearNum]) {
    return INDIAN_HOLIDAYS_BY_YEAR[yearNum];
  }
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
// Fetches/seeds that year's national holidays and
// pre-marks them (source: 'national'). Safe to run more than once —
// it upserts on date, so it won't duplicate or wipe out any admin edits
// made to a date that already exists.
router.post("/seed", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const year = Number(req.query.year) || new Date().getFullYear();
  const country = (req.query.country || "IN").toUpperCase();

  try {
    let list = [];
    if (country === "IN") {
      list = getIndianHolidaysForYear(year);
    } else {
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
        list = getIndianHolidaysForYear(year);
      }
    }

    const rows = list.map((h) => ({ date: h.date, name: h.name, source: "national" }));
    if (rows.length > 0) {
      // Multi-row insert, on conflict (date) do nothing — same as the
      // old ignoreDuplicates upsert, so re-running this never wipes out
      // any admin edits already made to a date that exists.
      const values = rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
      const params = rows.flatMap((r) => [r.date, r.name, r.source]);
      await pool.query(
        `insert into holidays (date, name, source) values ${values} on conflict (date) do nothing`,
        params
      );
    }

    res.json({ inserted: rows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;