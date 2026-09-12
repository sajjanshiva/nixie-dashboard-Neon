import React, { useEffect, useState } from "react";
import { Bell as BellIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { getAllNotifications } from "../lib/api.js";

const PAGE_SIZE = 24;

function fmtTime(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000)   return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export default function Notifications() {
  const [items, setItems]           = useState([]);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    setLoading(true);
    getAllNotifications({ page, pageSize: PAGE_SIZE })
      .then((data) => {
        setItems(data.notifications || []);
        setTotalPages(data.totalPages || 1);
      })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <p className="mb-4 text-[12.5px] text-slate-400 dark:text-slate-500">
        Your full notification history.
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BellIcon size={28} className="mb-2 text-slate-200 dark:text-slate-700" />
          <p className="text-[13px] text-slate-400">No notifications yet</p>
        </div>
      ) : (
        <>
          <div className="card divide-y divide-slate-50 overflow-hidden dark:divide-white/6 dark:bg-[#1A1D27]">
            {items.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 ${!n.read ? "bg-accent/3 dark:bg-accent/8" : ""}`}
              >
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: n.read ? "transparent" : "#FF6B5E" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-slate-700 dark:text-slate-200">{n.text}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{fmtTime(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}