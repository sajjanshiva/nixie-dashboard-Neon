import { Router } from "express";
import { pool } from "../lib/db.js";
import { istDateStr } from "../lib/istDate.js";
import { closeStaleSessions } from "./attendance.js";

const router = Router();
const WEIGHTS = { punctuality: 0.4, taskOnTime: 0.6 };

// FIX #7: was 1000 (~2.7 years) — silently truncated the calendar with
// no warning if ever exceeded. Raised generously so it's realistically
// never hit by a normal report, and the routes below now return an
// explicit error instead of quietly returning incomplete data if it is.
const MAX_RANGE_DAYS = 3660; // ~10 years

function parseYMD(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = parseYMD(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

function daysBetween(fromStr, toStr) {
  return Math.round((parseYMD(toStr) - parseYMD(fromStr)) / 86400000);
}

function eachDate(fromStr, toStr) {
  const dates = [];
  let cur = fromStr;
  let safety = 0;
  while (cur <= toStr && safety < MAX_RANGE_DAYS + 5) {
    dates.push(cur);
    cur = addDays(cur, 1);
    safety++;
  }
  return dates;
}

// Buckets a date into the Monday that starts its week — used to group
// overtime/trend data into weekly chart points.
function weekBucket(dateStr) {
  const d = parseYMD(dateStr);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMon);
  return toDateStr(d);
}

function shortLabel(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

async function safeQuery(sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch {
    return [];
  }
}

// The core calculation — one staff member, one date range. Used both for
// a single staff drill-down and (looped) for the admin summary table.
async function computePerformance(staffId, from, to) {
  if (!from || !to || from > to) {
    return {
      from, to, calendar: [],
      workingDays: 0, presentDays: 0, onTimeDays: 0, lateDays: 0, absentDays: 0, leaveDays: 0, holidayDays: 0,
      punctuality: 0,
      overtimeTotalMinutes: 0, weeklyOvertime: [],
      punctualityTrend: [],
      tasks: { assigned: 0, completed: 0, overdue: 0, onTimePct: 0 },
      score: 0,
    };
  }

  // Admin looking at this staff member's Performance is itself a trigger
  // for cleaning up any forgotten-checkout session — not just that staff
  // member's own next login. Means admin doesn't have to wait on them.
  await closeStaleSessions(staffId);

  const today = istDateStr(); // IST, not the server's own (likely UTC) clock

  const [attRows, holidayRows, leaveRows, taskRows, profileRows] = await Promise.all([
    safeQuery("select * from attendance where staff_id = $1 and date >= $2 and date <= $3 order by check_in asc", [staffId, from, to]),
    safeQuery("select date, name from holidays where date >= $1 and date <= $2", [from, to]),
    safeQuery("select date_from, date_to, status from leaves where staff_id = $1 and status = 'approved'", [staffId]),
    // FIX #3: previously `select * from tasks where assignee_id = $1`
    // with no date bound at all — pulled a staff member's ENTIRE task
    // history, every single time, for a report that's supposed to be
    // scoped to one period. The admin summary view made this worse,
    // running this unbounded query once per staff member, in parallel,
    // on every load. Now scoped to tasks that actually belong to this
    // period: due in range, OR completed in range, OR (for a task with
    // neither due date nor completion yet) created in range — every
    // branch is date-bounded, so nothing unbounded can slip through.
    safeQuery(
      `select * from tasks
        where assignee_id = $1
          and (
            (due_date is not null and due_date >= $2 and due_date <= $3)
            or (completed_at is not null and completed_at::date >= $2 and completed_at::date <= $3)
            or (due_date is null and completed_at is null and created_at::date >= $2 and created_at::date <= $3)
          )`,
      [staffId, from, to]
    ),
    safeQuery("select activated_at from profiles where id = $1 limit 1", [staffId]),
  ]);

  // Nothing before this date counts — this is when they actually first
  // used the app (stamped on their first authenticated request), not
  // when their account row happened to be created. Avoids marking
  // pre-launch/pre-onboarding days as "Absent".
  const activatedAt = profileRows?.[0]?.activated_at ? profileRows[0].activated_at.slice(0, 10) : null;

  const holidayMap = new Map((holidayRows || []).map((h) => [h.date, h.name]));

  const leaveSet = new Set();
  (leaveRows || []).forEach((l) => {
    if (!l?.date_from || !l?.date_to) return;
    const start = l.date_from < from ? from : l.date_from;
    const end = l.date_to > to ? to : l.date_to;
    if (start > end) return;
    eachDate(start, end).forEach((d) => leaveSet.add(d));
  });

  // Group session rows by date (a day can have several check-in/out pairs).
  const byDate = {};
  (attRows || []).forEach((r) => {
    if (!r?.date) return;
    if (!byDate[r.date]) byDate[r.date] = { sessions: [], status: null, overtimeMinutes: 0, workMode: null, autoClosed: false };
    byDate[r.date].sessions.push(r);
    if (r.status) byDate[r.date].status = r.status;
    if (!byDate[r.date].workMode) byDate[r.date].workMode = r.work_mode || "office";
    byDate[r.date].overtimeMinutes += Number(r.overtime_minutes) || 0;
    if (r.auto_closed) byDate[r.date].autoClosed = true;
  });

  const calendar = [];
  let workingDays = 0, onTimeDays = 0, lateDays = 0, holidayDays = 0, leaveDays = 0, presentDays = 0;
  const weeklyOvertimeMap = {};
  const trendPoints = [];

  for (const date of eachDate(from, to)) {
    const isFuture = date > today;
    const dayRow = byDate[date];
    let type, workMode = null, overtimeMinutes = 0;

    if (activatedAt === null || date < activatedAt) {
      type = "not_tracked"; // before their first real login — never counted
    } else if (holidayMap.has(date)) {
      type = "holiday"; holidayDays++;
    } else if (leaveSet.has(date)) {
      type = "leave"; leaveDays++;
    } else if (isFuture) {
      type = "future";
    } else if (dayRow) {
      type = dayRow.status === "late" ? "late" : "on_time";
      workMode = dayRow.workMode || "office";
      overtimeMinutes = dayRow.overtimeMinutes || 0;
      workingDays++; presentDays++;
      if (type === "on_time") onTimeDays++; else lateDays++;
    } else if (date === today) {
      type = "pending"; // today, hasn't checked in yet — neutral, not counted as absent
    } else {
      type = "absent"; workingDays++;
    }

    if (overtimeMinutes > 0) {
      const wk = weekBucket(date);
      weeklyOvertimeMap[wk] = (weeklyOvertimeMap[wk] || 0) + overtimeMinutes;
    }
    if (!isFuture && type !== "holiday" && type !== "leave" && type !== "pending" && type !== "not_tracked") {
      trendPoints.push({ date, punctual: type === "on_time" ? 1 : 0 });
    }

    calendar.push({ date, type, workMode, overtimeMinutes, autoClosed: dayRow?.autoClosed || false, holidayName: holidayMap.get(date) || null });
  }

  const absentDays = Math.max(0, workingDays - presentDays);
  const punctuality = workingDays > 0 ? Math.round((onTimeDays / workingDays) * 100) : 0;

  const overtimeTotalMinutes = Object.values(weeklyOvertimeMap).reduce((a, b) => a + b, 0);
  const weeklyOvertime = Object.entries(weeklyOvertimeMap)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([wk, minutes]) => ({ label: shortLabel(wk), minutes }));

  // Punctuality trend — daily points if the range is short, else bucketed weekly.
  let punctualityTrend;
  if (trendPoints.length > 45) {
    const byWeek = {};
    trendPoints.forEach((p) => {
      const wk = weekBucket(p.date);
      if (!byWeek[wk]) byWeek[wk] = { total: 0, onTime: 0 };
      byWeek[wk].total++;
      if (p.punctual === 1) byWeek[wk].onTime++;
    });
    punctualityTrend = Object.entries(byWeek)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([wk, v]) => ({ label: shortLabel(wk), pct: v.total > 0 ? Math.round((v.onTime / v.total) * 100) : null }));
  } else {
    punctualityTrend = trendPoints.map((p) => ({ label: shortLabel(p.date), pct: p.punctual * 100 }));
  }

  const tasks = taskRows || [];
  const completed = tasks.filter((t) => t && t.status === "Complete");
  const onTimeTasks = completed.filter((t) => {
    if (!t?.due_date) return false;
    // completed_at is the real fix (stamped only at the actual moment of
    // completion, ignored the instant a task isn't currently Complete).
    // Falls back to updated_at/created_at only for tasks completed
    // before this column existed, so old data doesn't suddenly look
    // wrong — those are the same fields this calculation used before.
    const doneDate = (typeof t.completed_at === "string" && t.completed_at.slice(0, 10))
      || (typeof t.updated_at === "string" && t.updated_at.slice(0, 10))
      || (typeof t.created_at === "string" && t.created_at.slice(0, 10))
      || "";
    return doneDate ? doneDate <= t.due_date : true;
  });
  const overdue = tasks.filter((t) => t && t.due_date && t.status !== "Complete" && t.due_date < today);
  const taskOnTimePct = completed.length ? Math.round((onTimeTasks.length / completed.length) * 100) : 0;

  const score = Math.round(WEIGHTS.punctuality * punctuality + WEIGHTS.taskOnTime * taskOnTimePct);

  return {
    from, to, calendar,
    workingDays, presentDays, onTimeDays, lateDays, absentDays, leaveDays, holidayDays,
    punctuality,
    overtimeTotalMinutes, weeklyOvertime,
    punctualityTrend,
    tasks: { assigned: tasks.length, completed: completed.length, overdue: overdue.length, onTimePct: taskOnTimePct },
    score,
  };
}

// GET /api/performance/staff/:staffId?from=&to=
// Staff can only fetch their own; admin can fetch anyone's.
router.get("/staff/:staffId", async (req, res) => {
  const { staffId } = req.params;
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ message: "from and to are required" });
  if (req.user?.role !== "admin" && req.user?.id !== staffId) {
    return res.status(403).json({ message: "Not allowed" });
  }
  // Explicit checks instead of letting a bad range fall through to
  // computePerformance's own guard, which returns a silent all-zero
  // result for from > to with no explanation of why. A clear error here
  // is more honest than a mysteriously empty report.
  if (from > to) {
    return res.status(400).json({ message: "'from' must be on or before 'to'." });
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return res.status(400).json({ message: "Date range too large — please select a shorter period." });
  }
  try {
    const result = await computePerformance(staffId, from, to);
    res.json(result);
  } catch (err) {
    console.error("[performance route] staff error:", err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/performance/summary?from=&to= — admin-only, all staff at once,
// used by the admin Performance table.
router.get("/summary", async (req, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ message: "from and to are required" });
  if (from > to) {
    return res.status(400).json({ message: "'from' must be on or before 'to'." });
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return res.status(400).json({ message: "Date range too large — please select a shorter period." });
  }

  try {
    const { rows: members } = await pool.query("select id, name, role from profiles where role != 'admin'");
    const results = await Promise.all(
      (members || []).map(async (m) => {
        try {
          return { member: m, stats: await computePerformance(m.id, from, to) };
        } catch (err) {
          console.warn(`[performance summary] failed for ${m.name}:`, err.message);
          return {
            member: m,
            stats: {
              from, to, calendar: [],
              workingDays: 0, presentDays: 0, onTimeDays: 0, lateDays: 0, absentDays: 0, leaveDays: 0, holidayDays: 0,
              punctuality: 0, overtimeTotalMinutes: 0, weeklyOvertime: [], punctualityTrend: [],
              tasks: { assigned: 0, completed: 0, overdue: 0, onTimePct: 0 },
              score: 0,
            }
          };
        }
      })
    );
    res.json(results);
  } catch (err) {
    console.error("[performance route] summary error:", err);
    res.status(500).json({ message: err.message });
  }
});

export default router;