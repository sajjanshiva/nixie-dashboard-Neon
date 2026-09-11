import React, { useEffect, useState } from "react";
import {
  CheckCircle2, CircleDot, Clock, MessageSquare, ChevronRight,
  CheckCircle,
} from "lucide-react";
import { getTasks, updateTaskProgress, markTaskComplete, undoTaskComplete } from "../../lib/api.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import TaskConversation from "../../components/TaskConversation.jsx";

const FILTERS = [
  { id: "all",      label: "All" },
  { id: "progress", label: "In Progress" },
  { id: "done",     label: "Complete" },
];

function statusIcon(status) {
  if (status === "Complete")    return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
  if (status === "In Progress") return <CircleDot    size={14} className="text-accent shrink-0" />;
  return <Clock size={14} className="text-slate-400 shrink-0" />;
}

function filterMatch(task, f) {
  if (!task) return false;
  if (f === "all")      return true;
  if (f === "progress") return task.status?.toLowerCase().includes("progress");
  if (f === "done")     return task.status === "Complete";
  return true;
}

// ── Mobile task info screen ─────────────────────────────────────────────
// Shows all task details + a big "Open Chat" button
function MobileTaskInfo({ task, onOpenChat, onBack, onProgressChange }) {
  if (!task) return null;

  const [progress, setProgress] = useState(task.progress ?? 0);
  const [status, setStatus]     = useState(task.status || "In Progress");
  const isComplete = status === "Complete";
  const linkList = typeof task.links === "string" ? task.links.split("\n").filter(Boolean) : [];

  async function handleComplete() {
    try {
      await markTaskComplete(task.id);
      setStatus("Complete");
      setProgress(100);
      onProgressChange?.(task.id, 100, "Complete");
    } catch (e) { alert(e.message); }
  }

  // Explicit undo for an accidental Mark Complete click.
  async function handleUndoComplete() {
    try {
      await undoTaskComplete(task.id);
      setStatus("In Progress");
      onProgressChange?.(task.id, progress, "In Progress");
    } catch (e) { alert(e.message); }
  }

  async function handleProgress(value) {
    setProgress(value);
    try {
      const result = await updateTaskProgress(task.id, value);
      // Same fix as TaskConversation.jsx: the backend reverts status to
      // "In Progress" when progress drops below 100% on a Complete task —
      // sync that back so this screen doesn't keep showing "Task Completed"
      // once the progress bar no longer agrees.
      const newStatus = result?.status || status;
      if (newStatus !== status) setStatus(newStatus);
      onProgressChange?.(task.id, value, newStatus !== status ? newStatus : undefined);
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-[#13151F]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-white/6">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8">
          <ChevronRight size={18} className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold text-slate-900 dark:text-white">{task.title || "Untitled Task"}</p>
          <p className="text-[11px] text-slate-400">{task.client_name || "—"}</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Status + due */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${isComplete ? "badge-success" : "badge-accent"}`}>{status}</span>
          {task.due_date && <span className="text-[11.5px] text-slate-400">Due: {task.due_date}</span>}
        </div>

        {/* Details card */}
        {(task.client_phone || task.description || linkList.length > 0) && (
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5 space-y-2">
            {task.client_phone && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Phone</p>
                <p className="text-[13.5px] text-slate-800 dark:text-slate-100">{task.client_phone}</p>
              </div>
            )}
            {task.description && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
                <p className="text-[13.5px] text-slate-800 dark:text-slate-100">{task.description}</p>
              </div>
            )}
            {linkList.length > 0 && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Links</p>
                {linkList.map((l, i) => (
                  <a key={i} href={l.trim()} target="_blank" rel="noreferrer"
                    className="block truncate text-[13px] text-accent hover:underline">
                    {l.trim()}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="rounded-2xl border border-slate-100 p-4 dark:border-white/8">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">Progress</p>
            <p className="text-[14px] font-bold text-accent">{progress}%</p>
          </div>
          <input type="range" min={0} max={100} defaultValue={progress}
            onMouseUp={(e) => handleProgress(Number(e.target.value))}
            onTouchEnd={(e) => handleProgress(Number(e.target.value))}
            className="w-full" style={{ accentColor: "#22D3D3" }}
          />
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
            <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-[10.5px] text-slate-400">Drag to update — client gets a WhatsApp message.</p>
        </div>

        {/* Mark Complete */}
        {!isComplete ? (
          <button onClick={handleComplete}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-[14px] font-bold text-white hover:bg-emerald-600 transition">
            <CheckCircle2 size={17} /> Mark Complete
          </button>
        ) : (
          <button onClick={handleUndoComplete}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-3 text-[13px] font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50">
            <CheckCircle size={16} /> Task Completed · Undo
          </button>
        )}
      </div>

      {/* Open Chat CTA */}
      <div className="shrink-0 border-t border-slate-100 p-4 dark:border-white/6">
        <button onClick={onOpenChat}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-accent py-4 text-[15px] font-bold text-white shadow-lg shadow-accent/25 hover:bg-accent-dark transition active:scale-[0.98]">
          <MessageSquare size={18} />
          Open Chat
        </button>
      </div>
    </div>
  );
}

export default function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks]       = useState([]);
  const [filter, setFilter]     = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  // Mobile: null | "info" | "chat"
  const [mobileView, setMobileView] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    getTasks({ assigneeId: user.id })
      .then((data) => {
        if (Array.isArray(data)) setTasks(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = tasks.filter((t) => filterMatch(t, filter));

  function handleProgressChange(taskId, progress, status) {
    setTasks((ts) => ts.map((t) =>
      t.id === taskId ? { ...t, progress, ...(status ? { status } : {}) } : t
    ));
    setSelected((s) => s?.id === taskId ? { ...s, progress, ...(status ? { status } : {}) } : s);
  }

  function selectTask(task) {
    setSelected(task);
    // On mobile, show info view first
    if (window.innerWidth < 768) {
      setMobileView("info");
    } else {
      setMobileView(null);
    }
  }

  function handleBackToList() {
    setSelected(null);
    setMobileView(null);
  }

  function handleOpenChat() {
    setMobileView("chat");
  }

  function handleBackToInfo() {
    setMobileView("info");
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Task list panel ─────────────────────────────────────── */}
      {/* On mobile: hide if viewing task info or chat */}
      <div className={`flex flex-col border-r border-slate-100 dark:border-white/6 ${
        mobileView ? "hidden md:flex" : "flex"
      } w-full md:w-[320px] md:shrink-0`}>
        {/* Filter bar */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-3 dark:border-white/6">
          {FILTERS.map((f) => {
            const count = tasks.filter((t) => filterMatch(t, f.id)).length;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                  filter === f.id
                    ? "bg-accent text-white shadow-sm"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/8 dark:text-slate-400"
                }`}>
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                  filter === f.id ? "bg-white/25 text-white" : "bg-slate-200 text-slate-500 dark:bg-white/12"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Task rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[13px] text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <CheckCircle2 size={32} className="mb-3 text-slate-200 dark:text-slate-700" />
              <p className="text-[13px] font-medium text-slate-400">No tasks here</p>
            </div>
          ) : (
            filtered.map((t) => (
              <button key={t.id} onClick={() => selectTask(t)}
                className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3.5 text-left transition dark:border-white/4 ${
                  selected?.id === t.id
                    ? "bg-accent/5 dark:bg-accent/10"
                    : "hover:bg-slate-50 dark:hover:bg-white/4"
                }`}>
                <div className="mt-0.5">{statusIcon(t.status)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{t.title || "Untitled"}</p>
                  <p className="truncate text-[11.5px] text-slate-400">{t.client_name || "—"}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                      <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${t.progress || 0}%` }} />
                    </div>
                    <span className="text-[11px] font-medium text-accent">{t.progress || 0}%</span>
                  </div>
                </div>
                <ChevronRight size={14} className="mt-1 shrink-0 text-slate-300 dark:text-slate-600" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div className={`flex flex-1 flex-col overflow-hidden ${
        mobileView ? "flex" : "hidden md:flex"
      }`}>
        {!selected ? (
          /* Empty state on desktop */
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-2xl bg-slate-100 p-5 dark:bg-white/6">
              <MessageSquare size={36} className="text-slate-300 dark:text-slate-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-slate-500 dark:text-slate-400">Select a task</p>
              <p className="text-[12.5px] text-slate-400">Click any task to view details and chat</p>
            </div>
          </div>
        ) : mobileView === "info" ? (
          /* ── Mobile: Task info screen ── */
          <MobileTaskInfo
            task={selected}
            onBack={handleBackToList}
            onOpenChat={handleOpenChat}
            onProgressChange={handleProgressChange}
          />
        ) : (
          /* ── Chat: Fixed overlay on mobile, standard right panel on desktop ── */
          <div className={
            mobileView === "chat"
              ? "fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#13151F] md:static md:z-auto md:h-full md:w-full"
              : "hidden h-full w-full flex-col md:flex"
          }>
            <TaskConversation
              task={selected}
              staffToggleLabel="Admin"
              onBack={mobileView === "chat" ? handleBackToInfo : handleBackToList}
              onProgressChange={handleProgressChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
