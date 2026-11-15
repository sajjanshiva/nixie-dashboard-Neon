import React, { useState } from "react";
import { MessageSquare, ChevronRight } from "lucide-react";
import { updateTaskProgress, TASK_STAGES, getStageFromTask } from "../lib/api.js";

// Mobile task info screen — shows all task details + stage updater +
// a big "Open Chat" button.
export default function MobileTaskInfo({ task, assigneeName, onOpenChat, onBack, onProgressChange }) {
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [status, setStatus]     = useState(task?.status || "In Progress");
  const [currentStage, setCurrentStage] = useState(getStageFromTask(task));
  const [updatingStage, setUpdatingStage] = useState(false);
  if (!task) return null;

  const isComplete = status === "Complete";
  const linkList = typeof task.links === "string" ? task.links.split("\n").filter(Boolean) : [];

  async function handleStageChange(newStage) {
    if (updatingStage) return;
    let newProg = progress;
    let newStat = status;
    if (newStage === "On Hold") {
      newStat = "On Hold";
    } else if (newStage === "Shipped") {
      newStat = "Complete";
      newProg = 100;
    } else {
      newStat = "In Progress";
      const found = TASK_STAGES.find((s) => s.name === newStage);
      if (found) newProg = found.progress;
    }

    setCurrentStage(newStage);
    setProgress(newProg);
    setStatus(newStat);
    setUpdatingStage(true);

    try {
      const result = await updateTaskProgress(task.id, newProg, newStage, newStat);
      const resStatus = result?.status || newStat;
      const resProg = result?.progress != null ? result.progress : newProg;
      const resStage = result?.stage || newStage;
      setStatus(resStatus);
      setProgress(resProg);
      setCurrentStage(resStage);
      onProgressChange?.(task.id, resProg, resStatus, resStage);
    } catch (e) {
      alert(e.message || "Failed to update stage");
    } finally {
      setUpdatingStage(false);
    }
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
          <span className={`badge ${
            status === "Complete" ? "badge-success"
            : status === "On Hold" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
            : "badge-accent"
          }`}>
            {status}
          </span>
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

        {/* Stage & Progress */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-[#1A1D27] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current Stage</p>
              <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100">{currentStage}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              status === "On Hold" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
              : isComplete ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-accent/10 text-accent dark:bg-accent/20"
            }`}>
              {progress}% · {status}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                status === "On Hold" ? "bg-amber-400" : isComplete ? "bg-emerald-500" : "bg-accent"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Stage selector dropdown */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-400">
              Update Stage:
            </label>
            <select
              disabled={updatingStage}
              value={currentStage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-accent dark:border-white/10 dark:bg-white/5 dark:text-slate-100 disabled:opacity-50"
            >
              {TASK_STAGES.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} ({s.progress}%)
                </option>
              ))}
              <option value="On Hold">⏸️ On Hold (Paused)</option>
            </select>
          </div>

          <p className="text-[10.5px] text-slate-400">
            Selecting a stage automatically advances progress and sends a WhatsApp update.
          </p>
        </div>
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
