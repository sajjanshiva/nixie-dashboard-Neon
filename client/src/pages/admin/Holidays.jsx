import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X as XIcon, Trash2, Check } from "lucide-react";
import { getHolidays, addOrEditHoliday, deleteHoliday, seedNationalHolidays } from "../../lib/api.js";
import { istDateStr } from "../../lib/istDate.js";
import toast from "react-hot-toast";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function Holidays() {
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [holidays, setHolidays]   = useState([]); // all holidays for viewYear
  const [loading, setLoading]     = useState(true);
  const [seeding, setSeeding]     = useState(false);
  const [editing, setEditing]     = useState(null); // { dateStr, existing }
  const [nameInput, setNameInput] = useState("");

  async function load(year) {
    setLoading(true);
    try {
      setHolidays(await getHolidays(year));
    } catch {
      toast.error("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(viewYear); /* eslint-disable-next-line */ }, [viewYear]);

  const holidayMap = useMemo(() => {
    const m = {};
    holidays.forEach((h) => { m[h.date] = h; });
    return m;
  }, [holidays]);

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await seedNationalHolidays(viewYear, "IN");
      toast.success(`Fetched ${res.inserted} national holidays for ${viewYear}`);
      load(viewYear);
    } catch (e) {
      toast.error(e.message || "Failed to fetch national holidays");
    } finally {
      setSeeding(false);
    }
  }

  function openEditor(dateStr) {
    const existing = holidayMap[dateStr];
    setEditing({ dateStr, existing });
    setNameInput(existing?.name || "");
  }

  async function handleSaveHoliday() {
    if (!nameInput.trim()) { toast.error("Enter a holiday name"); return; }
    try {
      await addOrEditHoliday(editing.dateStr, nameInput.trim());
      toast.success("Holiday saved");
      setEditing(null);
      load(viewYear);
    } catch (e) {
      toast.error(e.message || "Failed to save holiday");
    }
  }

  async function handleDeleteHoliday() {
    try {
      await deleteHoliday(editing.dateStr);
      toast.success("Holiday removed");
      setEditing(null);
      load(viewYear);
    } catch (e) {
      toast.error(e.message || "Failed to remove holiday");
    }
  }

  // Build calendar grid for the current month
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const todayStr = istDateStr(now);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-slate-400">
          Click any date to mark, edit, or remove a holiday. Staff can't check in on marked days, and those days
          don't count as "Absent" in performance.
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <Download size={13} />
          {seeding ? "Fetching…" : `Fetch ${viewYear} National Holidays`}
        </button>
      </div>

      {/* Calendar card */}
      <div className="card p-5 dark:bg-[#1A1D27]">
        {/* Month nav */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => changeMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </p>
          <button
            onClick={() => changeMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="mx-auto mb-2 grid max-w-[340px] grid-cols-7 gap-1.5 text-center">
          {DOW.map((d, i) => (
            <span key={i} className="text-[10.5px] font-semibold uppercase text-slate-400">{d}</span>
          ))}
        </div>

        {/* Date bubbles */}
        <div className="mx-auto grid max-w-[340px] grid-cols-7 gap-1.5">
          {loading
            ? Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-full bg-slate-100 dark:bg-white/5" />
              ))
            : cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = toDateStr(viewYear, viewMonth, day);
                const holiday = holidayMap[dateStr];
                const isToday = dateStr === todayStr;
                const isNational = holiday?.source === "national";
                return (
                  <button
                    key={i}
                    onClick={() => openEditor(dateStr)}
                    title={holiday?.name || ""}
                    className={`relative flex aspect-square items-center justify-center rounded-full text-[12.5px] font-semibold transition
                      ${holiday
                        ? isNational
                          ? "bg-accent text-white hover:bg-accent-dark"
                          : "bg-purple-500 text-white hover:bg-purple-600"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      }
                      ${isToday && !holiday ? "ring-2 ring-accent/40" : ""}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
        </div>

        {/* Legend */}
        <div className="mt-5 flex flex-wrap gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> National Holiday
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Custom Holiday
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full ring-2 ring-accent/40" /> Today
          </span>
        </div>
      </div>

      {/* This year's list */}
      <div className="card overflow-hidden dark:bg-[#1A1D27]">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-white/6">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{viewYear} Holidays</p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-white/6">
          {holidays.length === 0 && (
            <p className="px-5 py-6 text-center text-[13px] text-slate-400">No holidays marked yet.</p>
          )}
          {holidays.map((h) => (
            <button
              key={h.date}
              onClick={() => openEditor(h.date)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50/60 dark:hover:bg-white/3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${h.source === "national" ? "bg-accent" : "bg-purple-500"}`}
                />
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{h.name}</span>
              </div>
              <span className="text-[12px] text-slate-400">
                {new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-[#1A1D27]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100">
                {new Date(editing.dateStr).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <XIcon size={16} />
              </button>
            </div>

            <label className="mb-1.5 block text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              Holiday name
            </label>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Diwali, Office Anniversary"
              className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveHoliday}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-[12.5px] font-bold text-white hover:bg-accent-dark"
              >
                <Check size={14} /> Save
              </button>
              {editing.existing && (
                <button
                  onClick={handleDeleteHoliday}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] font-bold text-red-600 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}