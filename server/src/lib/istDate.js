// Every "what day is it" and "what time is X:XX on this date" calculation
// in the app goes through here — explicitly anchored to India Standard
// Time (Asia/Kolkata, UTC+5:30, no daylight saving), regardless of what
// timezone the server itself is actually running in (most cloud hosts,
// including Render, default to UTC).

// Today's date (or any Date object's calendar date), correctly in IST,
// as "YYYY-MM-DD" — safe no matter what timezone the server's system
// clock is set to. "en-CA" is used purely because that locale happens
// to format as YYYY-MM-DD.
export function istDateStr(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// A real, comparable Date object representing a specific wall-clock time
// (e.g. "17:00") on a specific date, IN INDIA TIME — e.g.
// istDateTimeAt("2026-09-07", "17:00") -> 5:00 PM IST on that date,
// correctly, no matter what timezone the server's clock is set to.
// IST has a fixed +05:30 offset (no DST), so this is safe as a literal.
export function istDateTimeAt(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00+05:30`);
}