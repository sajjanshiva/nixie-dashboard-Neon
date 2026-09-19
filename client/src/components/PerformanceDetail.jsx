import React, { useEffect, useMemo, useState } from "react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from "recharts";
import { ChevronLeft, ChevronRight, X as XIcon, Building2, Home as HomeIcon, AlertTriangle, Clock3 } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { getPerformance, getAttendanceDetail, correctAttendanceSession } from "../lib/api.js";
import { istDateStr as toDateStr, istDateTimeLocalStr, fromIstDateTimeLocalStr } from "../lib/istDate.js";
import toast from "react-hot-toast";

const PERIODS = ["Week", "Month", "Year"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function scoreColor(score) {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#FF6B5E";
}
function fmtMinutes(min) {
  if (!min) return "0m";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


function getRange(periodType, anchor) {
  const d = new Date(anchor);
  if (periodType === "Week") {
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(d); monday.setDate(d.getDate() + diffToMon);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return {
      from: toDateStr(monday), to: toDateStr(sunday),
      label: `${monday.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }
  if (periodType === "Year") {
    const y = d.getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}` };
  }
  const y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  return { from: toDateStr(first), to: toDateStr(last), label: `${MONTH_NAMES[m]} ${y}` };
}

function navigateAnchor(periodType, anchor, delta) {
  const d = new Date(anchor);
  if (periodType === "Week") d.setDate(d.getDate() + delta * 7);
  else if (periodType === "Year") d.setFullYear(d.getFullYear() + delta);
  else d.setMonth(d.getMonth() + delta);
  return d;
}

// Buckets each day's overtime into the right granularity for the chart —
// daily bars for a Week view (so there's more than one bar to show),
// weekly bars for a Month view, monthly bars for a Year view.
function weekBucketClient(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMon);
  return toDateStr(d);
}
function buildOvertimeChart(periodType, calendar) {
  if (!calendar || calendar.length === 0) return { title: "Overtime", data: [] };

  if (periodType === "Week") {
    return {
      title: "Daily Overtime",
      data: calendar.map((d) => ({
        label: new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" }),
        minutes: d.overtimeMinutes || 0,
      })),
    };
  }
  if (periodType === "Year") {
    const byMonth = Array.from({ length: 12 }, () => 0);
    calendar.forEach((d) => { byMonth[Number(d.date.slice(5, 7)) - 1] += d.overtimeMinutes || 0; });
    return { title: "Overtime by Month", data: byMonth.map((minutes, i) => ({ label: MONTH_NAMES[i], minutes })) };
  }
  // Month — weekly buckets
  const byWeek = {};
  calendar.forEach((d) => {
    const wk = weekBucketClient(d.date);
    byWeek[wk] = (byWeek[wk] || 0) + (d.overtimeMinutes || 0);
  });
  const data = Object.entries(byWeek)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([wk, minutes]) => ({
      label: new Date(`${wk}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      minutes,
    }));
  return { title: "Overtime by Week", data };
}

// Value label shown above each bar — skipped for zero so a mostly-empty
// period (e.g. a whole year with little overtime) doesn't get cluttered
// with "0m" everywhere.
function OvertimeBarLabel({ x, y, width, value }) {
  if (!value) return null;
  const h = Math.floor(value / 60), m = value % 60;
  const text = h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="#b45309">
      {text}
    </text>
  );
}

const TYPE_STYLES = {
  on_time: { bg: "bg-emerald-400", label: "On Time" },
  late:    { bg: "bg-amber-400",   label: "Late" },
  absent:  { bg: "bg-rose-300 dark:bg-rose-800", label: "Absent" },
  leave:   { bg: "bg-sky-400",     label: "Leave" },
  holiday: { bg: "bg-violet-400",  label: "Holiday" },
  future:  { bg: "bg-slate-200", text: "text-black", label: "Upcoming" },
  pending: { bg: "bg-slate-200 dark:bg-white/10 border-2 border-dashed border-slate-300 dark:border-white/20", label: "Not checked in yet" },
  not_tracked: { bg: "bg-slate-200", text: "text-black", label: "Not tracked yet" },
};

function ModeIcon({ mode, size = 9, className = "" }) {
  if (!mode) return null;
  const Icon = mode === "home" ? HomeIcon : Building2;
  return <Icon size={size} className={className} />;
}

function DayCell({ day, size = "normal", onClick }) {
  const style = TYPE_STYLES[day.type] || TYPE_STYLES.future;
  const clickable = ["on_time", "late", "absent"].includes(day.type);
  const dim = size === "small";
  return (
    <button
      onClick={() => clickable && onClick(day)}
      title={`${day.date}${day.holidayName ? " — " + day.holidayName : ""} — ${style.label}${day.overtimeMinutes ? ` — +${fmtMinutes(day.overtimeMinutes)} OT` : ""}${day.autoClosed ? " — Forgot to check out" : ""}`}
      className={`relative flex w-full items-center justify-center rounded-md ${dim ? "aspect-square text-[8.5px]" : "aspect-square text-[11px]"} font-medium ${style.text || "text-slate-700 dark:text-slate-200"} ${style.bg} ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"} ${day.autoClosed ? "shadow-[0_0_0_2px_#ef4444,0_0_10px_2px_rgba(239,68,68,0.65)] dark:shadow-[0_0_0_2px_#f87171,0_0_10px_3px_rgba(248,113,113,0.55)]" : ""} transition`}
    >
      {new Date(`${day.date}T00:00:00`).getDate()}
      {day.workMode && !dim && (
        <ModeIcon mode={day.workMode} size={8} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white/90 p-0.5 text-slate-500 dark:bg-black/40 dark:text-slate-200" />
      )}
      {day.autoClosed && !dim && (
        <AlertTriangle size={13} className="absolute -top-2 -left-2 rounded-full bg-white p-0.5 text-red-600 shadow dark:bg-[#1A1D27] dark:text-red-400" />
      )}
    </button>
  );
}

function MiniMonthGrid({ year, month, calendarByDate, onDayClick, small }) {
  const first = new Date(year, month, 1);
  const firstDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div>
      {small && <p className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{MONTH_NAMES[month]}</p>}
      <div className={`grid gap-1 ${small ? "grid-cols-7" : "grid-cols-[repeat(7,2.5rem)] justify-center"}`}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const info = calendarByDate[dateStr];
          if (!info) {
            return (
              <div
                key={i}
                title={`${dateStr} — Not tracked yet`}
                className={`flex items-center justify-center rounded-md ${small ? "aspect-square text-[8.5px]" : "aspect-square text-[11px]"} font-medium text-black bg-slate-200`}
              >
                {day}
              </div>
            );
          }
          return <DayCell key={i} day={info} size={small ? "small" : "normal"} onClick={onDayClick} />;
        })}
      </div>
    </div>
  );
}

export default function PerformanceDetail({ staffId, staffName, staffRole, isAdmin, onClose }) {
  const [periodType, setPeriodType] = useState("Month");
  const [anchor, setAnchor]         = useState(new Date());
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [selectedDay, setSelectedDay]     = useState(null);
  const [daySessions, setDaySessions]     = useState(null);
  const [dayLoading, setDayLoading]       = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTime, setEditTime]           = useState("");

  const range = getRange(periodType, anchor);
  const todayStr = toDateStr(new Date());
  const isCurrentRangeUpToToday = range.to >= todayStr;

  useEffect(() => {
    setLoading(true);
    getPerformance(staffId, range.from, range.to)
      .then(setData)
      .catch(() => toast.error("Failed to load performance data"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [staffId, periodType, range.from, range.to]);

  const calendarByDate = useMemo(() => {
    const map = {};
    (data?.calendar || []).forEach((d) => { map[d.date] = d; });
    return map;
  }, [data]);

  const overtimeChart = useMemo(
    () => buildOvertimeChart(periodType, data?.calendar),
    [periodType, data]
  );

  async function openDay(day) {
    setSelectedDay(day);
    setDayLoading(true);
    setEditingSessionId(null);
    try {
      const sessions = await getAttendanceDetail(staffId, day.date, day.date);
      setDaySessions(sessions);
    } catch {
      toast.error("Failed to load that day's sessions");
      setDaySessions([]);
    } finally {
      setDayLoading(false);
    }
  }

  function startEdit(session) {
    setEditingSessionId(session.id);
    const d = session.check_out ? new Date(session.check_out) : new Date();
    setEditTime(istDateTimeLocalStr(d));
  }

  async function saveEdit(session) {
    try {
      await correctAttendanceSession(session.id, fromIstDateTimeLocalStr(editTime).toISOString());
      toast.success("Session updated");
      setEditingSessionId(null);
      openDay(selectedDay);
      getPerformance(staffId, range.from, range.to).then(setData);
    } catch (e) {
      toast.error(e.message || "Failed to update session");
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const color = scoreColor(data.score);
  const radialData = [{ value: 100, fill: "#f1f5f9" }, { value: data.score, fill: color }];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={staffName} tone={staffRole === "admin" ? "admin" : "staff"} className="h-10 w-10 text-[13px]" />
          <div>
            <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100">{staffName}</p>
            {staffRole && <p className="text-[11.5px] capitalize text-slate-400">{staffRole}</p>}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8">
            <XIcon size={18} />
          </button>
        )}
      </div>

      {/* Period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodType(p)}
              className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                periodType === p
                  ? "bg-accent text-white"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(navigateAnchor(periodType, anchor, -1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[120px] text-center text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
            {range.label}
          </span>
          <button
            onClick={() => setAnchor(navigateAnchor(periodType, anchor, 1))}
            disabled={isCurrentRangeUpToToday}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Score hero */}
      <div className="card p-5 dark:bg-[#1A1D27]">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "#f1f5f9" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[26px] font-extrabold leading-none" style={{ color }}>{data.score}%</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Score</span>
            </div>
          </div>
          <div className="w-full flex-1 space-y-3">
            <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Overall Performance Score</p>
            {[
              { label: "Punctuality (40%)", value: data.punctuality || 0 },
              { label: "Task On-Time (60%)", value: data.tasks?.onTimePct || 0 },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{row.value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${row.value}%`, background: scoreColor(row.value) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stat strip */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {[
          { label: "On Time",  value: data.onTimeDays || 0,  color: "text-emerald-600" },
          { label: "Late",     value: data.lateDays || 0,    color: "text-amber-500" },
          { label: "Absent",   value: data.absentDays || 0,  color: "text-rose-500" },
          { label: "Leave",    value: data.leaveDays || 0,   color: "text-sky-500" },
          { label: "Holiday",  value: data.holidayDays || 0, color: "text-violet-500" },
          { label: "Overtime", value: fmtMinutes(data.overtimeTotalMinutes || 0), color: "text-slate-700 dark:text-slate-200" },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center dark:bg-[#1A1D27]">
            <p className="mb-0.5 text-[9.5px] uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className={`text-[16px] font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Calendar heatmap */}
      <div className="card p-5 dark:bg-[#1A1D27]">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Attendance Calendar</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {Object.entries(TYPE_STYLES).filter(([k]) => k !== "pending" && k !== "future" && k !== "not_tracked").map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className={`inline-block h-2 w-2 rounded-sm ${v.bg}`} />
                {v.label}
              </span>
            ))}
          </div>
        </div>

        {periodType === "Year" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }, (_, m) => (
              <MiniMonthGrid key={m} year={anchor.getFullYear()} month={m} calendarByDate={calendarByDate} onDayClick={openDay} small />
            ))}
          </div>
        ) : periodType === "Week" ? (
          <div className="grid grid-cols-7 gap-1.5 sm:mx-auto sm:max-w-[620px] sm:gap-2.5">
            {(data.calendar || []).map((day, i) => (
              <div key={i} className="flex flex-col items-stretch gap-1.5">
                <span className="truncate text-center text-[9px] font-medium text-slate-400 sm:text-[10px]">
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}
                </span>
                <DayCell day={day} onClick={openDay} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-[300px]">
            <MiniMonthGrid year={anchor.getFullYear()} month={anchor.getMonth()} calendarByDate={calendarByDate} onDayClick={openDay} />
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4 dark:bg-[#1A1D27]">
          <p className="mb-3 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{overtimeChart.title}</p>
          {overtimeChart.data.every((d) => !d.minutes) ? (
            <p className="flex h-[170px] items-center justify-center text-[12px] text-slate-400">No overtime this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={overtimeChart.data} barSize={periodType === "Year" ? 14 : 26} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="otGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={periodType === "Year" ? 0 : "preserveStartEnd"} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [fmtMinutes(v), "Overtime"]}
                  contentStyle={{ borderRadius: 10, fontSize: 12 }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar dataKey="minutes" radius={[6, 6, 0, 0]} fill="url(#otGradient)">
                  <LabelList content={<OvertimeBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4 dark:bg-[#1A1D27]">
          <p className="mb-3 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">Punctuality Trend</p>
          {data.punctualityTrend.length === 0 ? (
            <p className="flex h-[150px] items-center justify-center text-[12px] text-slate-400">No data this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={data.punctualityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip formatter={(v) => [`${v}%`, "On Time"]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Line type="monotone" dataKey="pct" stroke="#22D3D3" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Task stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Assigned",  value: data.tasks?.assigned || 0,  color: "text-slate-700 dark:text-slate-200" },
          { label: "Completed", value: data.tasks?.completed || 0, color: "text-emerald-600" },
          { label: "Overdue",   value: data.tasks?.overdue || 0,   color: "text-danger" },
          { label: "On-Time %", value: `${data.tasks?.onTimePct || 0}%`, color: "text-accent" },
        ].map((s) => (
          <div key={s.label} className="card p-4 dark:bg-[#1A1D27]">
            <p className="mb-1 text-[10.5px] uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className={`text-[20px] font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Day detail modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-[#1A1D27]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100">
                {new Date(`${selectedDay.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-slate-600">
                <XIcon size={16} />
              </button>
            </div>

            {dayLoading ? (
              <p className="py-6 text-center text-[12.5px] text-slate-400">Loading sessions…</p>
            ) : !daySessions || daySessions.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-slate-400">No sessions recorded.</p>
            ) : (
              <div className="space-y-2.5">
                {daySessions.map((s, i) => {
                  const isLastSessionOfDay = i === daySessions.length - 1;
                  return (
                  <div key={s.id} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center gap-1.5 text-[12.5px] font-medium ${s.auto_closed ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}>
                        <ModeIcon mode={s.work_mode} size={12} className={s.auto_closed ? "text-rose-400" : "text-slate-400"} />
                        {new Date(s.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {s.check_out ? new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"}
                      </div>
                      {s.overtime_minutes > 0 && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <Clock3 size={11} /> +{fmtMinutes(s.overtime_minutes)}
                        </span>
                      )}
                    </div>
                    {s.auto_closed && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10.5px] font-medium text-rose-600 dark:text-rose-400">
                        <AlertTriangle size={11} /> Forgot to check out — treated as {new Date(s.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}

                    {/* Admin can always fix the LAST session of the day's checkout —
                        not just once, and not only while it's still flagged. Once
                        corrected, auto_closed clears and the red styling/warning
                        above goes away on its own, but editing stays available in
                        case it needs adjusting again later. */}
                    {isAdmin && isLastSessionOfDay && (
                      editingSessionId === s.id ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            type="datetime-local"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11.5px] dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                          />
                          <button onClick={() => saveEdit(s)} className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">Save</button>
                          <button onClick={() => setEditingSessionId(null)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 dark:border-white/10">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(s)} className="mt-2 text-[11px] font-medium text-accent hover:underline">
                          Fix checkout time
                        </button>
                      )
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}