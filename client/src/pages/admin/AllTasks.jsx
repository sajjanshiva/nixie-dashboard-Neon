import React, { useEffect, useState } from "react";
import { ShoppingBag, Tag, ChevronRight, Trash2 } from "lucide-react";
import { getTasks, deleteTask } from "../../lib/api.js";
import TaskDrawer from "../../components/TaskDrawer.jsx";

// Remove "Unassigned" — every task is assigned at creation
const FILTERS = ["All", "In Progress", "Complete"];

function SourceIcon({ source }) {
  if (source === "shopify_order") return <ShoppingBag size={12} className="text-emerald-500" />;
  if (source === "shopify_lead")  return <Tag size={12} className="text-amber-400" />;
  return null;
}

// Count tasks per filter
function filterCount(tasks, f) {
  if (f === "All") return tasks.length;
  return tasks.filter((t) => t.status === f).length;
}

export default function AllTasks() {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("All");
  const [openTask, setOpenTask] = useState(null);
  const [drawerWidth, setDrawerWidth] = useState(520);

  useEffect(() => {
    getTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  // Case-insensitive filter match to handle any DB casing differences
  const filtered = tasks.filter((t) => {
    if (filter === "All") return true;
    return t.status?.toLowerCase().replace("_", " ") === filter.toLowerCase().replace("_", " ");
  });

  function handleProgressChange(taskId, progress, status) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, progress, ...(status ? { status } : {}) } : t)));
    setOpenTask((t) => t?.id === taskId ? { ...t, progress, ...(status ? { status } : {}) } : t);
  }

  // Manual tasks only — enforced server-side too. e.stopPropagation() is
  // needed since the delete icon sits inside the card's own onClick
  // (which opens the drawer) — without it, clicking delete would also
  // open the task.
  async function handleDelete(e, task) {
    e.stopPropagation();
    if (!confirm(`Delete "${task.title}"? This also deletes its chat history and can't be undone.`)) return;
    try {
      await deleteTask(task.id);
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      setOpenTask((t) => t?.id === task.id ? null : t);
    } catch (err) {
      alert(err.message || "Failed to delete task");
    }
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
          {tasks.length} tasks · updates sync automatically
        </p>
      </div>

      {/* Filter pills with counts */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = filterCount(tasks, f);
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
                filter === f
                  ? "bg-accent text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
              }`}
            >
              {f}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                filter === f ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 rounded-2xl bg-slate-100 p-5 dark:bg-white/6">
            <ShoppingBag size={32} className="text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-[14px] font-semibold text-slate-500">No tasks match this filter</p>
          <p className="mt-1 text-[12px] text-slate-400">Try "All" to see all tasks</p>
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
                  t.status === "Complete" ? "badge-success"
                  : t.status === "In Progress" ? "badge-accent"
                  : "badge-slate"
                }`}>
                  {t.status}
                </span>
                <div className="flex items-center gap-1.5">
                  <SourceIcon source={t.source} />
                  {t.source === "manual" && (
                    <button
                      onClick={(e) => handleDelete(e, t)}
                      title="Delete task"
                      className="rounded-md p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 dark:text-slate-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <ChevronRight size={15} className="text-slate-300 transition group-hover:text-accent dark:text-slate-600" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">{t.title}</p>
                <p className="truncate text-[12px] text-slate-400">{t.client_name || "—"}</p>
                <p className="truncate text-[11.5px] text-slate-400">Staff: {t.assignee?.name || "—"}</p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-400">Progress</span>
                  <span className="text-[11px] font-bold text-accent">{t.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                  <div className="h-1.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${t.progress}%` }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Resizable slide-in drawer — shared with Staff's My Tasks, so
          mobile behavior (info screen first, then chat) is identical */}
      {openTask && (
        <TaskDrawer
          task={openTask}
          assigneeName={openTask.assignee?.name}
          staffToggleLabel="Staff"
          onClose={() => setOpenTask(null)}
          onProgressChange={handleProgressChange}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
        />
      )}
    </div>
  );
}