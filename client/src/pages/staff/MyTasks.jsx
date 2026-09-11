import React, { useEffect, useState } from "react";
import { ChevronRight, ClipboardList } from "lucide-react";
import { getTasks } from "../../lib/api.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import TaskDrawer from "../../components/TaskDrawer.jsx";

const FILTERS = [
  { id: "all",      label: "All",          status: undefined },
  { id: "progress", label: "In Progress",  status: "In Progress" },
  { id: "done",     label: "Complete",     status: "Complete" },
];
const PAGE_SIZE = 18;

// Same card-grid layout as Admin's All Tasks, scoped to just this
// staff member's own tasks. Load-more pagination instead of numbered
// pages — lower volume than Admin's full task list, per the pagination
// plan (this page grows slower, so the simpler "load more" pattern is
// enough rather than full page-number navigation).
export default function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [counts, setCounts]     = useState({ all: 0, progress: 0, done: 0 });
  const [filter, setFilter]     = useState("all");
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openTask, setOpenTask] = useState(null);
  const [drawerWidth, setDrawerWidth] = useState(520);

  const activeFilter = FILTERS.find((f) => f.id === filter);

  // Filter pill counts
  useEffect(() => {
    if (!user?.id) return;
    Promise.all(FILTERS.map((f) => getTasks({ assigneeId: user.id, status: f.status, page: 1, pageSize: 1 })))
      .then((results) => {
        setCounts(Object.fromEntries(FILTERS.map((f, i) => [f.id, results[i].total])));
      }).catch(() => {});
  }, [user?.id, tasks.length]);

  // First page on filter change
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    setPage(1);
    getTasks({ assigneeId: user.id, status: activeFilter?.status, page: 1, pageSize: PAGE_SIZE })
      .then((data) => { setTasks(data.tasks || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    getTasks({ assigneeId: user.id, status: activeFilter?.status, page: nextPage, pageSize: PAGE_SIZE })
      .then((data) => {
        setTasks((prev) => [...prev, ...(data.tasks || [])]);
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  const hasMore = tasks.length < total;

  function handleProgressChange(taskId, progress, status) {
    setTasks((ts) => ts.map((t) =>
      t.id === taskId ? { ...t, progress, ...(status ? { status } : {}) } : t
    ));
    setOpenTask((t) => t?.id === taskId ? { ...t, progress, ...(status ? { status } : {}) } : t);
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
          {total} tasks assigned to you
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
              filter === f.id
                ? "bg-accent text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              filter === f.id ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
            }`}>
              {counts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 rounded-2xl bg-slate-100 p-5 dark:bg-white/6">
            <ClipboardList size={32} className="text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-[14px] font-semibold text-slate-500">No tasks here</p>
          <p className="mt-1 text-[12px] text-slate-400">Try "All" to see all your tasks</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenTask(t)}
                className="group card flex flex-col gap-3 p-4 text-left transition hover:shadow-md hover:border-accent/30 dark:bg-[#1A1D27] dark:hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`badge capitalize ${
                    t.status === "Complete" ? "badge-success" : "badge-accent"
                  }`}>
                    {t.status}
                  </span>
                  <ChevronRight size={15} className="text-slate-300 transition group-hover:text-accent dark:text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">{t.title || "Untitled"}</p>
                  <p className="truncate text-[12px] text-slate-400">{t.client_name || "—"}</p>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400">Progress</span>
                    <span className="text-[11px] font-bold text-accent">{t.progress || 0}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                    <div className="h-1.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${t.progress || 0}%` }} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {openTask && (
        <TaskDrawer
          task={openTask}
          staffToggleLabel="Admin"
          onClose={() => setOpenTask(null)}
          onProgressChange={handleProgressChange}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
        />
      )}
    </div>
  );
}