import React, { useEffect, useRef, useState } from "react";
import { Bell as BellIcon, BellPlus } from "lucide-react";
import { useAuth } from "../lib/AuthContext.jsx";
import { getNotifications, markAllNotificationsRead } from "../lib/api.js";
import { enablePush, getPushPermission, isPushSupported } from "../lib/push.js";
import toast from "react-hot-toast";

const POLL_INTERVAL_MS = 20 * 1000;

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen]   = useState(false);
  const [items, setItems] = useState([]);
  const [pushPermission, setPushPermission] = useState("unsupported");
  const [enabling, setEnabling] = useState(false);
  const knownIds = useRef(new Set());

  async function poll() {
    try {
      const data = await getNotifications();
      // Toast only for ones we haven't seen yet this session — replaces
      // the old Supabase Realtime "on insert" event, which fired exactly
      // once per new row. Skipped entirely on the very first load (that's
      // just existing history, not something newly arrived).
      const isFirstLoad = knownIds.current.size === 0;
      data.forEach((n) => {
        if (!isFirstLoad && !knownIds.current.has(n.id)) {
          toast(n.text, {
            icon: "🔔",
            style: { borderRadius: "12px", fontSize: "13px", border: "1px solid #E0FAFA" },
          });
        }
        knownIds.current.add(n.id);
      });
      setItems(data);
    } catch {
      // quietly skip a failed poll — it'll just try again next interval
    }
  }

  // Polling (replaces the old Supabase Realtime channel — Neon has no
  // equivalent). Paused while the tab isn't visible, so a background tab
  // left open all day doesn't keep quietly querying the database the
  // whole time — see the Page Visibility API.
  useEffect(() => {
    if (!user) return;
    poll();
    let timer = setInterval(poll, POLL_INTERVAL_MS);

    function onVisibilityChange() {
      clearInterval(timer);
      if (document.visibilityState === "visible") {
        poll(); // catch up immediately on returning to the tab
        timer = setInterval(poll, POLL_INTERVAL_MS);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Push permission state (shows the "Enable notifications" row
  //    only when the browser supports it and hasn't been asked yet) ──
  useEffect(() => {
    if (isPushSupported()) setPushPermission(getPushPermission());
  }, [open]);

  async function handleEnablePush() {
    setEnabling(true);
    try {
      await enablePush();
      setPushPermission("granted");
      toast.success("Notifications enabled on this device");
    } catch (err) {
      setPushPermission(getPushPermission());
      toast.error(err.message || "Couldn't enable notifications");
    } finally {
      setEnabling(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (!e.target.closest("[data-notification-bell]")) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = items.filter((i) => !i.read).length;

  async function markRead() {
    if (!user) return;
    await markAllNotificationsRead().catch(() => {});
    setItems((its) => its.map((i) => ({ ...i, read: true })));
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)   return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="relative" data-notification-bell>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/8"
        aria-label="Notifications"
      >
        <BellIcon size={19} />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "#FF6B5E" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] animate-fade-in overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-white/8 dark:bg-[#1A1D27]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/6">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                Notifications
              </span>
              {unread > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                  style={{ background: "#FF6B5E" }}
                >
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markRead}
                className="text-[11.5px] font-medium text-accent hover:underline dark:text-accent"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Enable push row — only shown if supported and not yet decided */}
          {pushPermission === "default" && (
            <button
              onClick={handleEnablePush}
              disabled={enabling}
              className="flex w-full items-center gap-2.5 border-b border-slate-100 bg-accent/5 px-4 py-3 text-left transition hover:bg-accent/10 disabled:opacity-60 dark:border-white/6 dark:bg-accent/10"
            >
              <BellPlus size={15} className="shrink-0 text-accent" />
              <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
                {enabling ? "Enabling…" : "Enable notifications on this device"}
              </span>
            </button>
          )}
          {pushPermission === "denied" && (
            <div className="border-b border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 dark:border-white/6">
              Notifications are blocked for this site in your browser settings.
            </div>
          )}

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <BellIcon size={28} className="mb-2 text-slate-200 dark:text-slate-700" />
                <p className="text-[12.5px] text-slate-400">No notifications yet</p>
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-white/4 ${
                    !n.read ? "bg-accent/3 dark:bg-accent/8" : ""
                  }`}
                >
                  {/* Unread indicator dot */}
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full transition"
                    style={{ background: n.read ? "transparent" : "#FF6B5E" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-snug text-slate-700 dark:text-slate-200">
                      {n.text}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      {fmtTime(n.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}