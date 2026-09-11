import React, { useState } from "react";
import { CheckCircle2, MessageSquare, ChevronRight, CheckCircle } from "lucide-react";
import { updateTaskProgress, markTaskComplete, undoTaskComplete } from "../lib/api.js";

// Mobile task info screen — shows all task details + a big "Open Chat"
// button. Used identically by both staff (My Tasks) and admin (All
// Tasks) on mobile, so tapping a task always shows this first instead
// of jumping straight into chat. assigneeName is optional — admin
// passes it (to show who the task belongs to), staff omits it (it's
// always their own task).
export default function MobileTaskInfo({ task, assigneeName, onOpenChat, onBack, onProgressChange }) {
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [status, setStatus]     = useState(task?.status || "In Progress");
  if (!task) return null;

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
        {(task.client_phone || task.description || assigneeName || linkList.length > 0) && (
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5 space-y-2">
            {assigneeName && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Assigned To</p>
                <p className="text-[13.5px] text-slate-800 dark:text-slate-100">{assigneeName}</p>
              </div>
            )}
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