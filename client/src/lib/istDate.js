// Browser-side equivalent of server/src/lib/istDate.js — makes sure the
// client's idea of "today" always matches the server's, explicitly
// anchored to India Standard Time regardless of the device's own system
// timezone setting.

// Formats any Date object as its IST calendar date, "YYYY-MM-DD" — safe
// to use on a Date built however (new Date(), local arithmetic, etc.),
// since this always re-reads it as an India wall-clock date rather than
// trusting the device's own timezone or doing a UTC round-trip.
export function istDateStr(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Formats a Date object as India wall-clock time in the exact shape a
// <input type="datetime-local"> expects: "YYYY-MM-DDTHH:mm". Needed
// because that input always shows/reads LOCAL wall time with no
// timezone info — using .toISOString() (UTC) here would silently show
// admin the wrong time by 5.5 hours.
export function istDateTimeLocalStr(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// The reverse — takes a <input type="datetime-local"> value (no
// timezone info, e.g. "2026-09-06T17:00") and builds a real Date
// object treating it as INDIA time explicitly — not the browser's own
// local timezone, so this is correct even if admin's device happens to
// be set to a different timezone.
export function fromIstDateTimeLocalStr(value) {
  return new Date(`${value}:00+05:30`);
}