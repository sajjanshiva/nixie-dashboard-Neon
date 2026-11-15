import React, { useEffect, useRef, useState } from "react";
import {
  MessageCircle, Users, Send, Check, Sparkles, ChevronLeft,
  AlertCircle, Clock, Info, ChevronUp, CheckCircle2, RotateCw,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import toast from "react-hot-toast";
import {
  getMessages, subscribeToMessages, sendMessage,
  updateTaskProgress, TASK_STAGES, getStageFromTask,
} from "../lib/api.js";
import { useAuth } from "../lib/AuthContext.jsx";

// ── Chat bubble components ──────────────────────────────────────────────
function Bubble({ msg, onRetry }) {
  if (!msg) return null;
  const isPending = msg._status === "pending";
  const isFailed  = msg._status === "failed";

  if (msg.kind === "system") {
    let formattedDate = "";
    if (msg.created_at) {
      try {
        formattedDate = new Date(msg.created_at).toLocaleString();
      } catch {
        formattedDate = "";
      }
    }
    return (
      <div className="my-3 flex justify-center">
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500 dark:bg-white/8 dark:text-slate-400">
          <Sparkles size={10} className="text-slate-400" />
          {msg.text || ""}
          {formattedDate && <span className="text-slate-300 dark:text-slate-600">·</span>}
          {formattedDate && <span>{formattedDate}</span>}
        </div>
      </div>
    );
  }

  // Retry action — shown on any failed bubble, staff or client-directed.
  const RetryButton = () => (
    <button
      onClick={() => onRetry?.(msg)}
      className="mt-1.5 flex items-center gap-1 rounded-md bg-rose-100 px-2 py-1 text-[10.5px] font-semibold text-rose-600 transition hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
    >
      <RotateCw size={10} /> Retry
    </button>
  );

  if (msg.kind === "staff") {
    const isAdmin = msg.author_role === "admin";
    const authorName = msg.author_name || (isAdmin ? "Admin" : "Staff");
    return (
      <div className={`my-2 flex items-end gap-2 ${isPending ? "opacity-60" : ""}`}>
        <Avatar name={authorName} tone={isAdmin ? "admin" : "staff"} className="h-7 w-7 shrink-0 text-[10px]" />
        <div className={`max-w-[78%] rounded-2xl rounded-bl-sm px-4 py-3 ${
          isFailed
            ? "border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
            : isAdmin
            ? "bg-accent/10 dark:bg-accent/15"
            // Bumped from indigo-50/10 (very light) to indigo-100/20 —
            // medium saturation, not pastel-light, not overly bright.
            : "bg-indigo-100 dark:bg-indigo-500/20"
        }`}>
          <p className={`mb-1 text-[11px] font-semibold ${
            isAdmin ? "text-accent-text dark:text-accent" : "text-indigo-600 dark:text-indigo-300"
          }`}>
            {authorName} · {isAdmin ? "Admin" : "Staff"}
          </p>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-800 dark:text-slate-100">{msg.text || ""}</p>
          {isFailed && (
            <div className="mt-1 flex items-center gap-2">
              <p className="flex items-center gap-1 text-[10.5px] text-rose-500"><AlertCircle size={10} /> Failed to send</p>
              <RetryButton />
            </div>
          )}
          {isPending && <p className="mt-1 flex items-center gap-1 text-[10.5px] text-slate-400"><Clock size={10} /> Sending…</p>}
        </div>
      </div>
    );
  }

  const fromClient = !!msg.is_client;
  const authorName = msg.author_name || (fromClient ? "Client" : "Staff");
  return (
    <div className={`my-2 flex items-end gap-2 ${fromClient ? "" : "flex-row-reverse"} ${isPending ? "opacity-60" : ""}`}>
      <Avatar name={authorName} tone={fromClient ? "client" : "admin"} className="h-7 w-7 shrink-0 text-[10px]" />
      <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${
        isFailed
          ? "border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
          : fromClient
          ? "rounded-bl-sm border border-amber-100 bg-amber-50/70 shadow-sm dark:border-amber-500/15 dark:bg-amber-500/10"
          : "rounded-br-sm bg-emerald-50 dark:bg-emerald-950/30"
      }`}>
        <p className={`mb-1 flex items-center text-[11px] font-semibold ${
          fromClient ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {authorName}
          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            <MessageCircle size={8} /> WhatsApp
          </span>
        </p>
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-800 dark:text-slate-100">{msg.text || ""}</p>

        {isFailed && (
          <div className="mt-1 flex items-center gap-2">
            <p className="flex items-center gap-1 text-[10.5px] text-rose-500"><AlertCircle size={10} /> Failed to send</p>
            <RetryButton />
          </div>
        )}
        {isPending && <p className="mt-1 flex items-center gap-1 text-[10.5px] text-slate-400"><Clock size={10} /> Sending…</p>}
      </div>
    </div>
  );
}

// ── Group-chat banner — shown once at the top of the thread when this
//    client has other active orders. Names each sibling order's handler
//    explicitly, so whoever's reading it immediately knows who else is
//    involved without having to go check elsewhere. ─────────────────
function MultiOrderBanner({ siblingTasks }) {
  if (!siblingTasks || siblingTasks.length === 0) return null;
  const parts = siblingTasks.map((t) => {
    const title = t.title || "Untitled";
    const handler = t.assignee_name ? `handled by ${t.assignee_name}` : "unassigned";
    return `${title} (${handler})`;
  });
  const list = parts.join(", ");
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>
        This client also has {siblingTasks.length} other active order{siblingTasks.length > 1 ? "s" : ""}: {list}.
        Everyone assigned can see and reply to client.
      </span>
    </div>
  );
}

// ── Task Info Bottom Sheet (mobile) ─────────────────────────────────────
function InfoSheet({ task, progress, onProgressCommit, onComplete, onUndoComplete, onClose }) {
  if (!task) return null;
  const isComplete = task.status === "Complete";
  const linkList = typeof task.links === "string" ? task.links.split("\n").filter(Boolean) : [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white px-5 pb-8 pt-2 shadow-2xl dark:bg-[#1A1D27] animate-slide-in-up">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mb-3 flex items-center justify-between">
          <span className={`badge ${isComplete ? "badge-success" : "badge-accent"}`}>{task.status || "In Progress"}</span>
          {task.due_date && <span className="text-[11.5px] text-slate-400">Due {task.due_date}</span>}
        </div>
        <h3 className="mb-1 text-[16px] font-bold text-slate-900 dark:text-white">{task.title || "Untitled Task"}</h3>
        <p className="mb-4 text-[12px] text-slate-400">Client: {task.client_name || "—"} · Staff: {task.assignee?.name || "—"}</p>

        {(task.client_phone || task.description || linkList.length > 0) && (
          <div className="mb-4 rounded-xl bg-slate-50 p-3 text-[12.5px] dark:bg-[#1A1D27] space-y-1">
            {task.client_phone && <p><span className="text-slate-400 dark:text-slate-400">Phone:</span> <span className="text-slate-700 dark:text-white">{task.client_phone}</span></p>}
            {task.description && <p><span className="text-slate-400 dark:text-slate-400">Description:</span> <span className="text-slate-700 dark:text-white">{task.description}</span></p>}
            {linkList.map((l, i) => (
              <a key={i} href={l.trim()} target="_blank" rel="noreferrer" className="block text-accent hover:underline">{l.trim()}</a>
            ))}
          </div>
        )}

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-[12px]">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Progress</span>
            <span className="font-bold text-accent">{progress}%</span>
          </div>
          <input type="range" min={0} max={100} defaultValue={progress}
            onMouseUp={(e) => onProgressCommit(Number(e.target.value))}
            onTouchEnd={(e) => onProgressCommit(Number(e.target.value))}
            className="w-full" style={{ accentColor: "#22D3D3" }}
          />
        </div>

        {isComplete ? (
          <button onClick={onUndoComplete} className="w-full rounded-xl bg-emerald-50 py-3 text-[13.5px] font-bold text-emerald-600 hover:bg-emerald-100 transition dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50">
            Completed · Undo
          </button>
        ) : (
          <button onClick={onComplete} className="w-full rounded-xl bg-emerald-500 py-3 text-[13.5px] font-bold text-white hover:bg-emerald-600 transition">
            Mark Complete
          </button>
        )}
      </div>
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────
// `staffToggleLabel` = "Staff" on admin side, "Admin" on staff side.
export default function TaskConversation({ task, staffToggleLabel = "Staff", onBack, onProgressChange }) {
  if (!task) return null;

  const { user }   = useAuth();
  const [messages, setMessages] = useState([]);
  const [hasMoreEarlier, setHasMoreEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [siblingActiveTasks, setSiblingActiveTasks] = useState([]);
  const [toStaff, setToStaff]   = useState(true);
  const [toClient, setToClient] = useState(false);
  const [text, setText]         = useState("");
  const [progress, setProgress] = useState(task.progress ?? 0);
  const [taskStatus, setTaskStatus] = useState(task.status || "In Progress");
  const [currentStage, setCurrentStage] = useState(getStageFromTask(task));
  const [updatingStage, setUpdatingStage] = useState(false);
  const [sending, setSending]   = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false); // desktop collapsible
  const [infoSheetOpen, setInfoSheetOpen] = useState(false); // mobile info sheet
  const scrollRef = useRef(null);
  // Set right before a "load earlier" prepend so the auto-scroll-to-bottom
  // effect below skips that one update (we're fixing scroll position
  // manually instead — see handleLoadEarlier).
  const skipAutoScrollRef = useRef(false);

  // Sync local state when task prop changes (e.g. after stage change in parent)
  useEffect(() => {
    setProgress(task.progress ?? 0);
    setTaskStatus(task.status || "In Progress");
    setCurrentStage(getStageFromTask(task));
  }, [task.progress, task.status, task.stage, task.id]);

  // Messages: initial load (latest 40) + live WebSocket subscription.
  // subscribeToMessages is synchronous now (see api.js) specifically to
  // avoid a race with React StrictMode's dev-mode double-mount closing
  // the socket mid-handshake.
  useEffect(() => {
    setMessages([]);
    setHasMoreEarlier(false);
    setSiblingActiveTasks([]);
    if (!task?.id) return;

    getMessages(task.id, { limit: 40 }).then((data) => {
      setMessages(data?.messages || []);
      setHasMoreEarlier(!!data?.hasMore);
      setSiblingActiveTasks(data?.siblingActiveTasks || []);
    }).catch(() => {});

    const unsub = subscribeToMessages(task.id, (m) => {
      if (!m) return;
      setMessages((prev) => {
        if (prev.some((e) => e.id === m.id)) return prev; // already have it
        // The duplicate-flicker fix: our own sent message can arrive back
        // over the WebSocket before our own POST request has even
        // resolved (broadcastNewMessages fires right after the DB
        // insert, server-side, ahead of the HTTP response). Rather than
        // just appending it alongside the still-pending temp bubble
        // (briefly showing both), find that matching temp — same kind,
        // same text, sent moments ago — and replace it in place.
        const matchIdx = prev.findIndex((e) =>
          e._status === "pending" &&
          e.kind === m.kind &&
          e.text === m.text &&
          Math.abs(new Date(e.created_at) - new Date(m.created_at)) < 15000
        );
        if (matchIdx !== -1) {
          const next = [...prev];
          next[matchIdx] = m;
          return next;
        }
        return [...prev, m];
      });
    });

    return unsub;
  }, [task?.id]);

  // "Load earlier" — fetches the 24 messages just before the oldest one
  // currently on screen, prepends them, and keeps the viewport visually
  // still (fixes scrollTop by however much taller the content just got)
  // instead of jumping the user's place in the conversation.
  async function handleLoadEarlier() {
    if (loadingEarlier || !hasMoreEarlier) return;
    const oldest = messages.find((m) => m.id && !m._status);
    if (!oldest) return;

    setLoadingEarlier(true);
    const container = scrollRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    try {
      const data = await getMessages(task.id, { before: oldest.id, limit: 24 });
      const older = data?.messages || [];
      if (older.length > 0) {
        skipAutoScrollRef.current = true;
        setMessages((prev) => [...older, ...prev]);
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      }
      setHasMoreEarlier(!!data?.hasMore);
    } catch {
      toast.error("Failed to load earlier messages");
    } finally {
      setLoadingEarlier(false);
    }
  }

  // Auto-scroll to bottom on new messages — skipped for the one update
  // right after a "load earlier" prepend (handled manually above instead).
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const isComplete = taskStatus === "Complete";
  const canSend = text.trim().length > 0 && (toStaff || toClient) && !sending;
  const linkList = typeof task.links === "string" ? task.links.split("\n").filter(Boolean) : [];

  // Shared by both the normal send button and Retry, so a retried
  // message goes through the exact same path rather than a separate,
  // easier-to-diverge code path. replaceTemps, when given, are the
  // specific failed bubbles being retried — removed once the retry
  // attempt resolves either way. Sending is never blocked — there's no
  // claiming/locking system anymore.
  async function attemptSend(msgText, wantStaff, wantClient, replaceTemps = null) {
    const now = new Date().toISOString();
    const temps = [];
    if (wantStaff)  temps.push({ id: `ts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: "staff",  author_name: user?.name || "Me", author_role: user?.role || "staff", text: msgText, created_at: now, _status: "pending" });
    if (wantClient) temps.push({ id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: "client", author_name: user?.name || "Me", is_client: false, text: msgText, created_at: now, _status: "pending" });

    setMessages((p) => {
      const withoutOld = replaceTemps ? p.filter((m) => !replaceTemps.some((t) => t.id === m.id)) : p;
      return [...withoutOld, ...temps];
    });

    try {
      const result = await sendMessage({ taskId: task.id, text: msgText, toStaff: wantStaff, toClient: wantClient });
      const real = result?.messages || [];
      setMessages((p) => {
        // Remove our temps; the matching real message may already be
        // present (delivered via the WS race-fix above) or may not be
        // yet — either way, add whatever from `real` isn't already there.
        const withoutTemps = p.filter((m) => !temps.some((t) => t.id === m.id));
        const ids = new Set(withoutTemps.map((m) => m.id));
        return [...withoutTemps, ...real.filter((r) => !ids.has(r.id))];
      });
    } catch (err) {
      setMessages((p) => p.map((m) => temps.some((t) => t.id === m.id) ? { ...m, _status: "failed" } : m));
    }
  }

  async function handleSend() {
    if (!canSend) return;
    const msgText = text;
    setText("");
    setSending(true);
    try {
      await attemptSend(msgText, toStaff, toClient);
    } finally {
      setSending(false);
    }
  }

  // Retries a single failed bubble using its own original text — a
  // failed "staff" bubble retries as staff-only, a failed "client"
  // bubble retries as client-only, matching how they were originally
  // split into separate temp entries in the first place.
  async function handleRetry(msg) {
    setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, _status: "pending" } : m));
    await attemptSend(msg.text, msg.kind === "staff", msg.kind === "client", [msg]);
  }

  async function handleStageChange(newStage) {
    if (updatingStage) return;
    let newProg = progress;
    let newStat = taskStatus;
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
    setTaskStatus(newStat);
    setUpdatingStage(true);

    try {
      const result = await updateTaskProgress(task.id, newProg, newStage, newStat);
      const resStatus = result?.status || newStat;
      const resProg = result?.progress != null ? result.progress : newProg;
      const resStage = result?.stage || newStage;
      setTaskStatus(resStatus);
      setProgress(resProg);
      setCurrentStage(resStage);
      onProgressChange?.(task.id, resProg, resStatus, resStage);
      getMessages(task.id, { limit: 40 }).then((data) => {
        setMessages(data?.messages || []);
        setHasMoreEarlier(!!data?.hasMore);
        setSiblingActiveTasks(data?.siblingActiveTasks || []);
      }).catch(() => {});
    } catch (e) {
      alert(e.message || "Failed to update stage");
    } finally {
      setUpdatingStage(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-[#13151F]">
      {/* ── Compact header (always visible) ─────────────────────── */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-100 px-3 py-2 dark:border-white/6">
        {onBack && (
          <button onClick={onBack} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 md:hidden">
            <ChevronLeft size={18} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`badge text-[10px] ${
              taskStatus === "Complete" ? "badge-success"
              : taskStatus === "On Hold" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              : "badge-accent"
            }`}>
              {taskStatus}
            </span>
            {task.due_date && <span className="text-[10.5px] text-slate-400">Due {task.due_date}</span>}
          </div>
          <p className="truncate text-[13.5px] font-bold text-slate-900 dark:text-white leading-tight">{task.title || "Untitled Task"}</p>
          <p className="truncate text-[11px] text-slate-400">{task.client_name || "—"} · {task.assignee?.name || "—"}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Info button — mobile: bottom sheet, desktop: toggles extra details */}
          <button
            onClick={() => {
              if (window.innerWidth < 768) setInfoSheetOpen(true);
              else setDetailsOpen((v) => !v);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
              detailsOpen
                ? "bg-accent/10 text-accent dark:bg-accent/20"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8"
            }`}
            title="Stage / Phone / description / links"
          >
            <Info size={15} />
          </button>
        </div>
      </div>

      {/* ── Always-visible slim progress strip ──────────────────────
           Click to expand stage selector (desktop) or info sheet (mobile) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (window.innerWidth < 768) setInfoSheetOpen(true);
          else setDetailsOpen((v) => !v);
        }}
        onKeyDown={(e) => e.key === "Enter" && (window.innerWidth < 768 ? setInfoSheetOpen(true) : setDetailsOpen((v) => !v))}
        className="flex shrink-0 cursor-pointer select-none items-center gap-2.5 border-b border-slate-100 px-3.5 py-2 transition hover:bg-slate-50/60 dark:border-white/6 dark:hover:bg-white/3"
        title={detailsOpen ? "Collapse stage panel" : "Click to view/change stage"}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                taskStatus === "On Hold" ? "bg-amber-400" : isComplete ? "bg-emerald-500" : "bg-accent"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="truncate text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">
            {currentStage}
          </span>
        </div>
        <span className={`shrink-0 text-right text-[11.5px] font-bold ${
          taskStatus === "On Hold" ? "text-amber-500" : isComplete ? "text-emerald-500" : "text-accent"
        }`}>
          {progress}%
        </span>
        <ChevronUp
          size={13}
          className={`shrink-0 text-slate-300 transition-transform dark:text-slate-600 ${detailsOpen ? "" : "rotate-180"}`}
        />
      </div>

      {/* ── Desktop collapsible details + stage selector ─────────── */}
      {detailsOpen && (
        <div className="hidden shrink-0 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-white/6 dark:bg-[#1A1D27] md:block animate-fade-in">
          {(task.client_phone || task.description || linkList.length > 0) && (
            <div className="mb-3 space-y-1 text-[12px]">
              {task.client_phone && <p><span className="text-slate-400 dark:text-slate-400">Phone:</span> <span className="text-slate-700 dark:text-white">{task.client_phone}</span></p>}
              {task.description && <p><span className="text-slate-400 dark:text-slate-400">Description:</span> <span className="text-slate-700 dark:text-white">{task.description}</span></p>}
              {linkList.map((l, i) => (
                <a key={i} href={l.trim()} target="_blank" rel="noreferrer" className="mr-2 text-accent hover:underline">{l.trim()}</a>
              ))}
            </div>
          )}

          {/* Stage & Progress controller */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#151722]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                Production Stage & Progress
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                taskStatus === "On Hold" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                : isComplete ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-accent/10 text-accent dark:bg-accent/20"
              }`}>
                {progress}% · {taskStatus}
              </span>
            </div>

            {/* Stage Selector Dropdown */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Update Stage (automatically moves progress & notifies client):
              </label>
              <select
                disabled={updatingStage}
                value={currentStage}
                onChange={(e) => handleStageChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-800 shadow-sm outline-none focus:border-accent dark:border-white/10 dark:bg-[#1A1D27] dark:text-slate-100 disabled:opacity-50"
              >
                {TASK_STAGES.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({s.progress}%)
                  </option>
                ))}
                <option value="On Hold">⏸️ On Hold (Paused)</option>
              </select>
            </div>

            {/* Stepper Buttons */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {TASK_STAGES.map((s, idx) => {
                const isPassed = progress >= s.progress && taskStatus !== "On Hold";
                const isCurrent = currentStage === s.name;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={updatingStage}
                    onClick={() => handleStageChange(s.name)}
                    title={`Click to set stage to ${s.name} (${s.progress}%)`}
                    className={`flex flex-col items-center justify-center rounded-lg p-1.5 text-center transition disabled:opacity-50 ${
                      isCurrent
                        ? "bg-accent/15 border border-accent/40 font-bold text-accent"
                        : isPassed
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200/70 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                        : "bg-slate-50 text-slate-400 hover:bg-slate-100 dark:bg-white/3 dark:text-slate-500 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="text-[10px] font-bold">Step {idx + 1}</span>
                    <span className="mt-0.5 text-[9px] leading-tight line-clamp-1">{s.name.split("/")[0].split("&")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Chat thread ──────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {hasMoreEarlier && (
          <div className="mb-2 flex justify-center">
            <button
              onClick={handleLoadEarlier}
              disabled={loadingEarlier}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            >
              {loadingEarlier ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        <MultiOrderBanner siblingTasks={siblingActiveTasks} />
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 opacity-50">
            <MessageCircle size={28} className="text-slate-300 dark:text-slate-600" />
            <p className="text-[12.5px] text-slate-400">No messages yet</p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id || Math.random()} msg={m} onRetry={handleRetry} />)
        )}
      </div>

      {/* ── Composer ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-3 dark:border-white/6 dark:bg-[#13151F]">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button onClick={() => setToStaff((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition ${
              toStaff
                ? "border-accent/40 bg-accent/10 text-accent-text dark:border-accent/30 dark:bg-accent/15 dark:text-accent"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
            }`}>
            {toStaff && <Check size={11} />}<Users size={12} />{staffToggleLabel}
          </button>
          <button onClick={() => setToClient((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition ${
              toClient
                ? "border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
            }`}>
            {toClient && <Check size={11} />}<MessageCircle size={12} />Client
          </button>
          <span className="ml-auto self-center text-[10.5px] text-slate-400">
            {!toStaff && !toClient ? "Select target" : toStaff && toClient ? "Staff + Client" : toStaff ? "Staff only" : "Client only"}
          </span>
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Write a message…" rows={2}
            className="flex-1 resize-none bg-transparent text-[13.5px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <button onClick={handleSend} disabled={!canSend}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent-dark disabled:opacity-40">
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* ── Mobile: Info bottom sheet ────────────────────────────── */}
      {infoSheetOpen && (
        <InfoSheet
          task={{ ...task, status: taskStatus }}
          progress={progress}
          onProgressCommit={handleProgressCommit}
          onComplete={() => { handleComplete(); setInfoSheetOpen(false); }}
          onUndoComplete={() => { handleUndoComplete(); setInfoSheetOpen(false); }}
          onClose={() => setInfoSheetOpen(false)}
        />
      )}
    </div>
  );
}