import React, { useCallback, useEffect, useRef, useState } from "react";
import { ShoppingBag, Tag, X, ChevronRight, GripVertical } from "lucide-react";
import { getTasks } from "../../lib/api.js";
import TaskConversation from "../../components/TaskConversation.jsx";

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

// ── Resizable slide-in drawer ───────────────────────────────────────────
function TaskDrawer({ task, onClose, onProgressChange, width, onWidthChange }) {
  const overlayRef   = useRef(null);
  const isDragging   = useRef(false);
  const startX       = useRef(0);
  const startWidth   = useRef(0);

  // Resize via drag handle on the left edge of the drawer
  const startResize = useCallback((e) => {
    isDragging.current = true;
    startX.current     = e.clientX;
    startWidth.current = width;
    document.body.style.cursor       = "ew-resize";
    document.body.style.userSelect   = "none";

    function onMove(ev) {
      if (!isDragging.current) return;
      const delta  = startX.current - ev.clientX; // positive = dragging left = wider
      const newW   = Math.min(Math.max(startWidth.current + delta, 360), window.innerWidth * 0.88);
      onWidthChange(newW);
    }
    function onUp() {
      isDragging.current           = false;
      document.body.style.cursor   = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, [width, onWidthChange]);

  // Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] animate-fade-in"
      />

      {/* Drawer — full-screen on mobile, configurable width on md+ */}
      <div
        className="fixed inset-y-0 right-0 z-40 flex flex-col bg-white shadow-2xl dark:bg-[#13151F] animate-slide-in-right"
        style={{ width: window.innerWidth < 768 ? "100%" : `${width}px` }}
      >
        {/* Drag handle — desktop only, on the left edge */}
        <div
          onMouseDown={startResize}
          className="absolute inset-y-0 left-0 hidden w-1.5 cursor-ew-resize items-center justify-center md:flex group"
          title="Drag to resize"
        >
          <div className="h-12 w-1 rounded-full bg-slate-200 group-hover:bg-accent transition dark:bg-slate-700" />
        </div>

        {/* Drawer top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-white/6 md:pl-5">
          <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Task Details</p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/8"
          >
            <X size={16} />
          </button>
        </div>

        {/* Task conversation fills the rest */}
        <div className="flex-1 overflow-hidden">
          <TaskConversation
            task={task}
            staffToggleLabel="Staff"
            onProgressChange={onProgressChange}
          />
        </div>
      </div>
    </>
  );
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

      {/* Resizable slide-in drawer */}
      {openTask && (
        <TaskDrawer
          task={openTask}
          onClose={() => setOpenTask(null)}
          onProgressChange={handleProgressChange}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
        />
      )}
    </div>
  );
}