import React, { useEffect, useState } from "react";
import { ChevronRight, ClipboardList } from "lucide-react";
import { getTasks } from "../../lib/api.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import TaskDrawer from "../../components/TaskDrawer.jsx";

const FILTERS = [
  { id: "all",      label: "All" },
  { id: "progress", label: "In Progress" },
  { id: "done",     label: "Complete" },
];

function filterMatch(task, f) {
  if (!task) return false;
  if (f === "all")      return true;
  if (f === "progress") return task.status?.toLowerCase().includes("progress");
  if (f === "done")     return task.status === "Complete";
  return true;
}

function filterCount(tasks, f) {
  return tasks.filter((t) => filterMatch(t, f)).length;
}

// Same card-grid layout as Admin's All Tasks, scoped to just this
// staff member's own tasks — was previously a cramped narrow list with
// a mostly-empty right panel; now matches Admin's pattern exactly,
// including the shared TaskDrawer (same resizable desktop panel, same
// mobile info-first-then-chat behavior).
export default function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks]       = useState([]);
  const [filter, setFilter]     = useState("all");
  const [loading, setLoading]   = useState(true);
  const [openTask, setOpenTask] = useState(null);
  const [drawerWidth, setDrawerWidth] = useState(520);

  useEffect(() => {
    if (!user?.id) return;
    getTasks({ assigneeId: user.id })
      .then((data) => { if (Array.isArray(data)) setTasks(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = tasks.filter((t) => filterMatch(t, filter));

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
          {tasks.length} tasks assigned to you
        </p>
      </div>

      {/* Filter pills with counts */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = filterCount(tasks, f.id);
          return (
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
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task grid — same layout as Admin's All Tasks */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 rounded-2xl bg-slate-100 p-5 dark:bg-white/6">
            <ClipboardList size={32} className="text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-[14px] font-semibold text-slate-500">No tasks here</p>
          <p className="mt-1 text-[12px] text-slate-400">Try "All" to see all your tasks</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
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
      )}

      {/* Same shared drawer Admin uses — identical resizable desktop
          panel and mobile info-first-then-chat behavior */}
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