import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPerformanceSummary } from "../../lib/api.js";
import Avatar from "../../components/Avatar.jsx";
import PerformanceDetail from "../../components/PerformanceDetail.jsx";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PERIODS = ["Week", "Month", "Year"];

function scoreColor(score) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-danger";
}
function fmtMinutes(min) {
  if (!min) return "0m";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getRange(periodType, anchor) {
  const d = new Date(anchor);
  if (periodType === "Week") {
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(d); monday.setDate(d.getDate() + diffToMon);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: toDateStr(monday), to: toDateStr(sunday), label: `${monday.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` };
  }
  if (periodType === "Year") {
    const y = d.getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}` };
  }
  const y = d.getFullYear(), m = d.getMonth();
  return { from: toDateStr(new Date(y, m, 1)), to: toDateStr(new Date(y, m + 1, 0)), label: `${MONTH_NAMES[m]} ${y}` };
}
function navigateAnchor(periodType, anchor, delta) {
  const d = new Date(anchor);
  if (periodType === "Week") d.setDate(d.getDate() + delta * 7);
  else if (periodType === "Year") d.setFullYear(d.getFullYear() + delta);
  else d.setMonth(d.getMonth() + delta);
  return d;
}

export default function Performance() {
  const [periodType, setPeriodType] = useState("Month");
  const [anchor, setAnchor]         = useState(new Date());
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null); // { id, name, role }

  const range = getRange(periodType, anchor);
  const todayStr = toDateStr(new Date());
  const isCurrentRangeUpToToday = range.to >= todayStr;

  useEffect(() => {
    setLoading(true);
    getPerformanceSummary(range.from, range.to)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.warn("Failed to load performance summary:", err);
        setRows([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [periodType, range.from, range.to]);

  const validRows = rows.filter((r) => r && r.stats);
  const teamPunctuality = validRows.length ? Math.round(validRows.reduce((a, r) => a + (r.stats.punctuality || 0), 0) / validRows.length) : 0;
  const teamTaskOnTime  = validRows.length ? Math.round(validRows.reduce((a, r) => a + (r.stats.tasks?.onTimePct || 0), 0) / validRows.length) : 0;
  const totalDone     = validRows.reduce((a, r) => a + (r.stats.tasks?.completed || 0), 0);
  const totalOverdue  = validRows.reduce((a, r) => a + (r.stats.tasks?.overdue || 0), 0);
  const totalOvertime = validRows.reduce((a, r) => a + (r.stats.overtimeTotalMinutes || 0), 0);

  const STAT_CARDS = [
    { label: "Team Punctuality", value: `${teamPunctuality}%`, color: "text-emerald-600" },
    { label: "Task On-Time",     value: `${teamTaskOnTime}%`,  color: "text-accent" },
    { label: "Tasks Completed",  value: totalDone,             color: "text-slate-800 dark:text-slate-100" },
    { label: "Overdue Tasks",    value: totalOverdue,          color: "text-danger" },
    { label: "Team Overtime",    value: fmtMinutes(totalOvertime), color: "text-amber-500" },
  ];

  if (selected) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6">
        <PerformanceDetail
          staffId={selected.id}
          staffName={selected.name}
          staffRole={selected.role || "staff"}
          isAdmin
          onClose={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-6">
      {/* Period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodType(p)}
              className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                periodType === p ? "bg-accent text-white" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(navigateAnchor(periodType, anchor, -1))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[110px] text-center text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">{range.label}</span>
          <button onClick={() => setAnchor(navigateAnchor(periodType, anchor, 1))} disabled={isCurrentRangeUpToToday} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Team stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="card p-4 dark:bg-[#1A1D27]">
            <p className="mb-1 text-[10.5px] uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className={`text-[20px] font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Staff table */}
      <div className="card overflow-hidden dark:bg-[#1A1D27]">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-white/6">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Staff Breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-white/6">
                <th className="px-5 py-2.5 font-semibold">Employee</th>
                <th className="px-3 py-2.5 font-semibold">Punctuality</th>
                <th className="px-3 py-2.5 font-semibold">Task On-Time</th>
                <th className="px-3 py-2.5 font-semibold">Tasks Done</th>
                <th className="px-3 py-2.5 font-semibold">Overtime</th>
                <th className="px-3 py-2.5 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-white/5" /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">No staff members yet.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.member.id}
                    onClick={() => setSelected({ id: r.member.id, name: r.member.name, role: r.member.role })}
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-accent/5 dark:border-white/6 dark:hover:bg-accent/10"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.member.name} tone="staff" className="h-7 w-7 text-[10px]" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{r.member.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{r.stats.punctuality}%</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{r.stats.tasks.onTimePct}%</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{r.stats.tasks.completed}/{r.stats.tasks.assigned}</td>
                    <td className="px-3 py-3 text-amber-600">{fmtMinutes(r.stats.overtimeTotalMinutes)}</td>
                    <td className={`px-3 py-3 font-bold ${scoreColor(r.stats.score)}`}>{r.stats.score}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}