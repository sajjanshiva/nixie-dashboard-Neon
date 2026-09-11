import React, { useEffect, useState } from "react";
import { MapPin, LogIn, LogOut, Clock, CheckCircle2, Building2, Home as HomeIcon, AlertTriangle } from "lucide-react";
import { useAuth } from "../../lib/AuthContext.jsx";
import {
  checkIn, checkOut, syncAttendance,
  getTodaySessions, getWeekAttendance, getSettings,
} from "../../lib/api.js";
import { istDateStr } from "../../lib/istDate.js";
import toast from "react-hot-toast";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function statusDot(status, isFuture) {
  if (isFuture)  return { bg: "bg-slate-100 dark:bg-white/8", ring: "", label: "" };
  if (!status)   return { bg: "bg-slate-200 dark:bg-slate-700", ring: "", label: "Absent" };
  if (status === "on_time") return { bg: "bg-emerald-400", ring: "ring-2 ring-emerald-200 dark:ring-emerald-800", label: "On Time" };
  if (status === "late")    return { bg: "bg-amber-400",   ring: "ring-2 ring-amber-200 dark:ring-amber-800",   label: "Late" };
  return { bg: "bg-slate-200", ring: "", label: "" };
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function duration(from, to) {
  if (!from || !to) return null;
  const diff = Math.round((new Date(to) - new Date(from)) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ModeIcon({ mode, size = 12, className = "" }) {
  if (mode === "home") return <HomeIcon size={size} className={className} />;
  return <Building2 size={size} className={className} />;
}

export default function Home() {
  const { user } = useAuth();
  const [sessions, setSessions]   = useState([]);
  const [week, setWeek]           = useState({});
  const [weekMon, setWeekMon]     = useState(null);
  const [settings, setSettings]   = useState(null);
  const [busy, setBusy]           = useState(false);
  const [choosingMode, setChoosingMode] = useState(false);
  const [initLoading, setInitLoading]   = useState(true);

  async function loadAll() {
    if (!user) return;
    try {
      await syncAttendance(); // close any forgotten-checkout session from a previous day
      const [todaySessions, weekData, settingsData] = await Promise.all([
        getTodaySessions(user.id),
        getWeekAttendance(user.id),
        getSettings(),
      ]);
      setSessions(todaySessions);
      setWeek(weekData.map);
      setWeekMon(weekData.monday);
      setSettings(settingsData);
    } catch {
      // silent — buttons still functional, worst case check-in call fails clearly
    } finally {
      setInitLoading(false);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user]);

  // ── Derived state ────────────────────────────────────────────────────
  const lastSession = sessions[sessions.length - 1] || null;
  const isOpen = !!lastSession && !lastSession.check_out;

  const todayStr = istDateStr();
  let officeEndToday = null;
  if (settings?.officeEndTime) {
    const [h, m] = settings.officeEndTime.split(":").map(Number);
    officeEndToday = new Date();
    officeEndToday.setHours(h, m, 0, 0);
  }
  const dayLocked = officeEndToday
    ? sessions.some((s) => s.check_out && new Date(s.check_out) >= officeEndToday)
    : false;

  const totalMinutesToday = sessions.reduce((sum, s) => {
    if (!s.check_out) return sum;
    return sum + Math.round((new Date(s.check_out) - new Date(s.check_in)) / 60000);
  }, 0);
  const overtimeMinutesToday = sessions.reduce((sum, s) => sum + (s.overtime_minutes || 0), 0);

  // ── Actions ──────────────────────────────────────────────────────────
  async function performCheckIn(workMode, coords) {
    setBusy(true);
    try {
      const res = await checkIn({ lat: coords?.lat, lng: coords?.lng, workMode });
      toast.success(`Checked in (${workMode === "home" ? "Work from Home" : "Work from Office"}) at ${fmtTime(res.check_in)}`);
      setChoosingMode(false);
      await loadAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleChooseOffice() {
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device/browser.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => performCheckIn("office", { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { toast.error("Location permission is required for office check-in."); setBusy(false); }
    );
  }

  function handleChooseHome() {
    performCheckIn("home", null);
  }

  async function handleCheckOut() {
    setBusy(true);
    try {
      const res = await checkOut();
      const wasOvertime = (res.overtime_minutes || 0) > 0;
      toast.success(
        `Checked out at ${fmtTime(res.check_out)}` + (wasOvertime ? ` — +${res.overtime_minutes}m overtime` : "")
      );
      await loadAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const nowDate = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    if (!weekMon) return { label: DAY_LABELS[i], dateStr: "", isFuture: false, isToday: false };
    const d = new Date(weekMon);
    d.setDate(weekMon.getDate() + i);
    const dateStr = istDateStr(d);
    const isFuture = dateStr > todayStr;
    const isToday  = dateStr === todayStr;
    return { label: DAY_LABELS[i], dateStr, isFuture, isToday, row: week[dateStr] };
  });

  return (
    <div className="px-4 py-5 md:px-8 md:py-7 space-y-5 max-w-xl mx-auto md:max-w-none">
      {/* Greeting */}
      <div>
        <h2 className="text-[18px] font-bold text-slate-900 dark:text-white">
          Good {nowDate.getHours() < 12 ? "morning" : nowDate.getHours() < 17 ? "afternoon" : "evening"},{" "}
          {user?.name?.split(" ")[0]} 👋
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-400">
          {nowDate.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* ── Main Check-in / Check-out card ────────────────────────────── */}
      <div className="card overflow-hidden dark:bg-[#1A1D27]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-white/6">
          <Clock size={15} className="text-accent" />
          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Attendance — Today
          </p>
        </div>

        <div className="px-5 py-5">
          {initLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-slate-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading attendance…
            </div>
          ) : dayLocked ? (
            /* ── Day fully done, locked until tomorrow ─────────────── */
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">
                    Work day complete
                  </p>
                  <p className="text-[12.5px] text-slate-400">
                    Total: <span className="font-medium text-slate-600 dark:text-slate-300">{duration(0, totalMinutesToday * 60000) || "—"}</span>
                    {overtimeMinutesToday > 0 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        +{Math.floor(overtimeMinutesToday / 60)}h {overtimeMinutesToday % 60}m overtime
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[12.5px] text-slate-500 dark:border-white/6 dark:bg-white/4 dark:text-slate-400">
                You've checked out for the day. You can check in again tomorrow from {settings?.officeStartTime || "9:00 AM"}.
              </div>
            </div>
          ) : isOpen ? (
            /* ── Currently checked in ──────────────────────────────── */
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 items-center justify-center">
                  <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <div>
                  <p className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-800 dark:text-slate-100">
                    Currently checked in
                    <ModeIcon mode={lastSession.work_mode} size={13} className="text-slate-400" />
                  </p>
                  <p className="text-[12px] text-slate-400">
                    Since {fmtTime(lastSession.check_in)} ·{" "}
                    <span className="font-medium capitalize">
                      {lastSession.work_mode === "home" ? "Work from Home" : "Work from Office"}
                    </span>
                  </p>
                </div>
              </div>

              <button
                onClick={handleCheckOut}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-800 py-3.5 text-[14px] font-semibold text-white transition hover:bg-slate-900 active:scale-[0.98] disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15"
              >
                <LogOut size={17} />
                {busy ? "Checking out…" : "Check Out"}
              </button>
            </div>
          ) : choosingMode ? (
            /* ── Choosing Work From Office / Home ──────────────────── */
            <div className="space-y-3">
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">How are you working today?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleChooseOffice}
                  disabled={busy}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-accent/20 bg-accent/5 py-5 transition hover:border-accent/40 hover:bg-accent/10 disabled:opacity-50"
                >
                  <Building2 size={22} className="text-accent" />
                  <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Work From Office</span>
                  <span className="text-[10.5px] text-slate-400">Verifies your location</span>
                </button>
                <button
                  onClick={handleChooseHome}
                  disabled={busy}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 py-5 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/8"
                >
                  <HomeIcon size={22} className="text-slate-500 dark:text-slate-300" />
                  <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Work From Home</span>
                  <span className="text-[10.5px] text-slate-400">No location needed</span>
                </button>
              </div>
              <button
                onClick={() => setChoosingMode(false)}
                className="w-full text-center text-[12px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* ── Not checked in (first time today, or between sessions) ── */
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/6 dark:bg-white/4">
                <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                  Choose Work From Office to verify your location, or Work From Home to check in instantly.
                </p>
              </div>
              <button
                onClick={() => setChoosingMode(true)}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent py-4 text-[15px] font-bold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-dark active:scale-[0.98] disabled:opacity-50"
              >
                <LogIn size={18} />
                {sessions.length > 0 ? "Check In Again" : "Check In"}
              </button>
            </div>
          )}

          {/* Today's sessions list */}
          {sessions.length > 0 && (
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 dark:border-white/6">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Today's Sessions
              </p>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[12px] dark:bg-white/4"
                >
                  <div className="flex items-center gap-2">
                    <ModeIcon mode={s.work_mode} size={13} className="text-slate-400 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300">
                      {fmtTime(s.check_in)} – {s.check_out ? fmtTime(s.check_out) : "…"}
                    </span>
                    {s.auto_closed && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        <AlertTriangle size={10} /> Forgot to check out
                      </span>
                    )}
                  </div>
                  {s.overtime_minutes > 0 && (
                    <span className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">
                      +{s.overtime_minutes}m OT
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── This Week strip ─────────────────────────────────────────────── */}
      <div className="card dark:bg-[#1A1D27]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-white/6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            This Week
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {weekDays.map((d, i) => {
              const dayInfo = d.row;
              const dot = statusDot(dayInfo?.status, d.isFuture);
              const firstMode = dayInfo?.sessions?.[0]?.work_mode;
              return (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <span className={`text-[10.5px] font-medium ${d.isToday ? "text-accent font-bold" : "text-slate-400 dark:text-slate-500"}`}>
                    {d.label}
                  </span>
                  <div className="relative">
                    <div
                      title={dot.label || (d.isFuture ? "Upcoming" : "No record")}
                      className={`h-7 w-7 rounded-full transition ${dot.bg} ${dot.ring} ${d.isToday ? "scale-110" : ""}`}
                    />
                    {firstMode && (
                      <ModeIcon
                        mode={firstMode}
                        size={9}
                        className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 text-slate-500 shadow dark:bg-[#1A1D27] dark:text-slate-300"
                      />
                    )}
                  </div>
                  {dayInfo?.overtimeMinutes > 0 && (
                    <span className="text-[8.5px] font-semibold text-amber-500">+{dayInfo.overtimeMinutes}m</span>
                  )}
                  {d.isToday && <span className="text-[9px] font-semibold text-accent">Today</span>}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {[
              { color: "bg-emerald-400", label: "On Time" },
              { color: "bg-amber-400",   label: "Late" },
              { color: "bg-slate-300 dark:bg-slate-600", label: "Absent" },
              { color: "bg-slate-100 dark:bg-white/8",   label: "Upcoming" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className={`inline-block h-2 w-2 rounded-full ${l.color}`} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}