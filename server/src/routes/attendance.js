import { Router } from "express";
import { pool } from "../lib/db.js";
import { haversineMeters } from "../lib/haversine.js";
import { getSetting } from "../lib/settings.js";
import { istDateStr, istDateTimeAt } from "../lib/istDate.js";

const router = Router();

function todayDate() {
  return istDateStr();
}

function dateTimeAt(dateStr, hhmm) {
  return istDateTimeAt(dateStr, hhmm);
}

// Closes any session left open (check_in but no check_out) from a
// PREVIOUS day — staff forgot to check out. Closes it at that day's
// office end time, flags it auto_closed, and does NOT credit overtime
// (we don't know when they actually left, so we don't guess).
export async function closeStaleSessions(staffId) {
  const today = todayDate();
  let openRows;
  try {
    const { rows } = await pool.query(
      "select * from attendance where staff_id = $1 and check_out is null and date < $2",
      [staffId, today]
    );
    openRows = rows;
  } catch (err) {
    console.error("[closeStaleSessions] failed to load open sessions:", err.message);
    return;
  }
  if (!openRows?.length) return;

  const officeEndTime = (await getSetting("office_end_time")) || "17:00";
  for (const row of openRows) {
    const closeAt = dateTimeAt(row.date, officeEndTime);
    try {
      await pool.query(
        "update attendance set check_out = $1, auto_closed = true, overtime_minutes = 0 where id = $2",
        [closeAt.toISOString(), row.id]
      );
    } catch (err) {
      console.error(`[closeStaleSessions] failed to close session ${row.id}:`, err.message);
    }
  }
}

router.post("/sync", async (req, res) => {
  await closeStaleSessions(req.user.id);
  res.json({ ok: true });
});

router.post("/check-in", async (req, res) => {
  const { lat, lng, workMode } = req.body;
  if (workMode !== "office" && workMode !== "home") {
    return res.status(400).json({ message: "workMode must be 'office' or 'home'" });
  }
  if (workMode === "office" && (lat == null || lng == null)) {
    return res.status(400).json({ message: "lat and lng are required for office check-in" });
  }

  await closeStaleSessions(req.user.id);

  const today = todayDate();
  const officeStartTime = (await getSetting("office_start_time")) || "09:30";
  const officeEndTime = (await getSetting("office_end_time")) || "17:00";

  try {
    const { rows } = await pool.query("select name from holidays where date = $1", [today]);
    if (rows[0]) {
      return res.status(403).json({ message: `Today is a holiday (${rows[0].name}) — check-in is disabled.` });
    }
  } catch (err) {
    console.warn("[check-in holiday check] error:", err.message);
  }

  const { rows: todaysRows } = await pool.query(
    "select * from attendance where staff_id = $1 and date = $2 order by check_in asc",
    [req.user.id, today]
  );

  const openSession = todaysRows.find((r) => !r.check_out);
  if (openSession) {
    return res.status(400).json({ message: "You're already checked in — check out first." });
  }

  const officeEndToday = dateTimeAt(today, officeEndTime);
  const dayEnded = todaysRows.some((r) => r.check_out && new Date(r.check_out) >= officeEndToday);
  if (dayEnded) {
    return res.status(403).json({ message: "You've already checked out for today. Check in again tomorrow from 9 AM." });
  }

  // Blocks checking in before office_start_time — applies to both work
  // modes (office and home), not just office. Previously officeStartTime
  // was only used to LABEL a check-in as on_time/late after the fact;
  // there was no actual lower bound stopping an early one.
  const officeStartToday = dateTimeAt(today, officeStartTime);
  if (new Date() < officeStartToday) {
    return res.status(403).json({ message: `Check-in opens at ${officeStartTime} — you're a bit early.` });
  }

  if (workMode === "office") {
    const officeLocation = await getSetting("office_location");
    // FIX #5: previously, a missing office_location setting would fall
    // back to a fabricated { lat: 0, lng: 0 } — a real spot on the map
    // (off the coast of Africa), which would make EVERY office
    // check-in fail with a confusing "you're thousands of km away"
    // error, and that bad value would get permanently written back to
    // the database by getSetting's auto-heal, not just used in memory.
    // Now: a genuinely unconfigured office location is caught here
    // explicitly, with a clear, actionable message instead of running
    // distance math against a guess.
    if (!officeLocation || officeLocation.lat == null || officeLocation.lng == null) {
      return res.status(400).json({
        message: "Office location hasn't been set up yet — ask your admin to configure it in Settings.",
      });
    }
    const distance = haversineMeters(lat, lng, officeLocation.lat, officeLocation.lng);
    if (distance > officeLocation.radius_meters) {
      return res.status(403).json({
        message: `You're ${Math.round(distance)}m from the office — check-in must be within ${officeLocation.radius_meters}m.`,
      });
    }
  }

  const now = new Date();
  const isFirstSessionToday = !todaysRows.length;
  // Grace period after office start that still counts as "on time" — a
  // real fix needed once early check-in got blocked above: without this,
  // "on time" (at-or-before start) becomes almost impossible to hit
  // exactly, since nobody can arrive early anymore to land before it.
  const ON_TIME_GRACE_MINUTES = 10;
  const onTimeCutoff = new Date(officeStartToday.getTime() + ON_TIME_GRACE_MINUTES * 60000);
  const status = isFirstSessionToday ? (now <= onTimeCutoff ? "on_time" : "late") : null;

  // FIX #1: the read-then-write gap above (check for an open session,
  // then insert a new one) is a real race — two near-simultaneous
  // requests (a double-click, a retried request on a flaky network)
  // could both pass the check above before either one's insert lands.
  // A partial unique index in the database (see the accompanying SQL
  // migration: only one row per staff_id may have check_out IS NULL at
  // a time) makes this impossible at the data layer, not just here in
  // application code — so this insert is wrapped to catch that specific
  // failure and turn it into the same friendly message as the normal
  // check above, instead of it surfacing as a raw 500 error.
  let inserted;
  try {
    const { rows } = await pool.query(
      `insert into attendance (staff_id, date, check_in, work_mode, status)
       values ($1, $2, $3, $4, $5) returning *`,
      [req.user.id, today, now.toISOString(), workMode, status]
    );
    inserted = rows[0];
  } catch (err) {
    if (err.code === "23505") {
      // Lost the race — someone else's (or this same person's retried)
      // check-in request landed a moment earlier.
      return res.status(400).json({ message: "You're already checked in — check out first." });
    }
    throw err;
  }

  // As decided during migration planning: activated_at marks this
  // person's FIRST EVER check-in, not their invite/password-set time —
  // stamped once, here, the first time it happens.
  await pool.query(
    "update profiles set activated_at = coalesce(activated_at, $1) where id = $2",
    [now.toISOString(), req.user.id]
  );

  res.json(inserted);
});

router.post("/check-out", async (req, res) => {
  await closeStaleSessions(req.user.id);

  const today = todayDate();
  const { rows: openRows } = await pool.query(
    `select * from attendance where staff_id = $1 and date = $2 and check_out is null
     order by check_in desc limit 1`,
    [req.user.id, today]
  );
  const row = openRows[0];
  if (!row) return res.status(400).json({ message: "You haven't checked in today" });

  const now = new Date();
  const officeEndTime = await getSetting("office_end_time");
  const officeEndToday = dateTimeAt(today, officeEndTime);

  const overtimeStart = new Date(Math.max(new Date(row.check_in).getTime(), officeEndToday.getTime()));
  const overtimeMinutes = now > overtimeStart ? Math.round((now - overtimeStart) / 60000) : 0;

  const { rows } = await pool.query(
    "update attendance set check_out = $1, overtime_minutes = $2 where id = $3 returning *",
    [now.toISOString(), overtimeMinutes, row.id]
  );
  res.json(rows[0]);
});

// GET /api/attendance/summary?staffId=... — replaces the old direct-
// Supabase getAttendanceSummary(). Staff can only ever get their own
// (staffId is ignored/forced for non-admins, same pattern as tasks/leads).
router.get("/summary", async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const staffId = isAdmin ? req.query.staffId : req.user.id;
  const params = [];
  let sql = "select * from attendance";
  if (staffId) {
    sql += " where staff_id = $1";
    params.push(staffId);
  }
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/attendance/today — all of today's sessions for the logged-in
// staff member, oldest first.
router.get("/today", async (req, res) => {
  const { rows } = await pool.query(
    "select * from attendance where staff_id = $1 and date = $2 order by check_in asc",
    [req.user.id, todayDate()]
  );
  res.json(rows);
});

// GET /api/attendance/week — this week (Mon-Sun) for the logged-in
// staff member. Used by the Home page week strip.
router.get("/week", async (req, res) => {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const from = istDateStr(monday);
  const to = istDateStr(sunday);

  const { rows } = await pool.query(
    `select date, status, check_in, check_out, work_mode, auto_closed, overtime_minutes
       from attendance where staff_id = $1 and date >= $2 and date <= $3`,
    [req.user.id, from, to]
  );
  res.json(rows);
});

// GET /api/attendance/detail?staffId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin-only detailed session log for one staff member over a range.
router.get("/detail", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { staffId, from, to } = req.query;
  if (!staffId || !from || !to) return res.status(400).json({ message: "staffId, from, to are required" });

  const { rows } = await pool.query(
    `select * from attendance where staff_id = $1 and date >= $2 and date <= $3
     order by date asc, check_in asc`,
    [staffId, from, to]
  );
  res.json(rows);
});

// PUT /api/attendance/:id — admin-only correction (e.g. fixing an
// auto-closed session with the real checkout time the staff reports).
router.put("/:id", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { checkOut } = req.body || {};
  if (!checkOut) return res.status(400).json({ message: "checkOut is required" });

  const { rows: existing } = await pool.query("select * from attendance where id = $1", [req.params.id]);
  const row = existing[0];
  if (!row) return res.status(404).json({ message: "Session not found" });

  const officeEndTime = await getSetting("office_end_time");
  const officeEndThatDay = dateTimeAt(row.date, officeEndTime);
  const checkOutDate = new Date(checkOut);
  const overtimeStart = new Date(Math.max(new Date(row.check_in).getTime(), officeEndThatDay.getTime()));
  const overtimeMinutes = checkOutDate > overtimeStart ? Math.round((checkOutDate - overtimeStart) / 60000) : 0;

  const { rows } = await pool.query(
    "update attendance set check_out = $1, auto_closed = false, overtime_minutes = $2 where id = $3 returning *",
    [checkOutDate.toISOString(), overtimeMinutes, req.params.id]
  );
  res.json(rows[0]);
});

export default router;