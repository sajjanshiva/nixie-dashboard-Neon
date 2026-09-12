import React, { useEffect, useRef, useState } from "react";
import {
  MessageCircle, Users, Send, Check, Sparkles, ChevronLeft,
  AlertCircle, Clock, Info, ChevronUp, CheckCircle2, RotateCw,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import toast from "react-hot-toast";
import {
  getMessages, subscribeToMessages, sendMessage,
  updateTaskProgress, markTaskComplete, undoTaskComplete,
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
            : "bg-indigo-50 dark:bg-indigo-500/10"
        }`}>
          <p className={`mb-1 text-[11px] font-semibold ${
            isAdmin ? "text-accent-text dark:text-accent" : "text-indigo-500 dark:text-indigo-300"
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
//    client has other active orders. Replaces the old per-message
//    "ambiguous reply / already replied elsewhere" claiming system:
//    nothing is locked or guessed anymore, everyone assigned to any of
//    this client's active orders (plus admin) effectively shares one
//    conversation, and this banner is just the heads-up that it's
//    happening. ─────────────────────────────────────────────────────
function MultiOrderBanner({ siblingTasks }) {
  if (!siblingTasks || siblingTasks.length === 0) return null;
  const names = siblingTasks.map((t) => t.title || "Untitled").join(", ");
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>
        This client also has {siblingTasks.length} other active order{siblingTasks.length > 1 ? "s" : ""}: {names}.
        Messages here may relate to any of them — everyone assigned can see and reply.
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
  const [sending, setSending]   = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false); // desktop collapsible
  const [infoSheetOpen, setInfoSheetOpen] = useState(false); // mobile info sheet
  const scrollRef = useRef(null);
  // Set right before a "load earlier" prepend so the auto-scroll-to-bottom
  // effect below skips that one update (we're fixing scroll position
  // manually instead — see handleLoadEarlier).
  const skipAutoScrollRef = useRef(false);

  // Sync local state when task prop changes (e.g. after mark complete in parent)
  useEffect(() => {
    setProgress(task.progress ?? 0);
    setTaskStatus(task.status || "In Progress");
  }, [task.progress, task.status, task.id]);

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
  // attempt resolves either way. No more "lost the race" handling here —
  // sending is never blocked now that claiming has been removed.
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

  async function handleProgressCommit(value) {
    setProgress(value);
    try {
      const result = await updateTaskProgress(task.id, value);
      // Backend reverts status to "In Progress" when progress drops below
      // 100% on a task that was marked Complete — sync that back into local
      // state so the badge/filter don't keep showing "Complete" once the
      // progress bar no longer agrees.
      const newStatus = result?.status || taskStatus;
      if (newStatus !== taskStatus) setTaskStatus(newStatus);
      onProgressChange?.(task.id, value, newStatus !== taskStatus ? newStatus : undefined);
    } catch (e) { alert(e.message); }
  }

  async function handleComplete() {
    try {
      await markTaskComplete(task.id);
      setTaskStatus("Complete");
      setProgress(100);
      onProgressChange?.(task.id, 100, "Complete");
      getMessages(task.id, { limit: 40 }).then((data) => {
        setMessages(data?.messages || []);
        setHasMoreEarlier(!!data?.hasMore);
        setSiblingActiveTasks(data?.siblingActiveTasks || []);
      }).catch(() => {});
    } catch (e) { alert(e.message); }
  }

  // Explicit "undo" for an accidental Mark Complete click — reverts status
  // only, leaves whatever progress value is currently set untouched.
  async function handleUndoComplete() {
    try {
      await undoTaskComplete(task.id);
      setTaskStatus("In Progress");
      onProgressChange?.(task.id, progress, "In Progress");
    } catch (e) { alert(e.message); }
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
            <span className={`badge text-[10px] ${isComplete ? "badge-success" : "badge-accent"}`}>{taskStatus}</span>
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
            title="Phone / description / links"
          >
            <Info size={15} />
          </button>

          {!isComplete && (
            <button onClick={handleComplete}
              className="hidden items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600 transition sm:flex">
              <CheckCircle2 size={13} /> Mark Complete
            </button>
          )}
          {isComplete && (
            <button onClick={handleUndoComplete} title="Undo — reopen this task"
              className="hidden items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 sm:flex">
              <CheckCircle2 size={12} /> Completed · Undo
            </button>
          )}
        </div>
      </div>

      {/* ── Always-visible slim progress strip ──────────────────────
           Click to expand the slider panel (desktop) or info sheet (mobile) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (window.innerWidth < 768) setInfoSheetOpen(true);
          else setDetailsOpen((v) => !v);
        }}
        onKeyDown={(e) => e.key === "Enter" && (window.innerWidth < 768 ? setInfoSheetOpen(true) : setDetailsOpen((v) => !v))}
        className="flex shrink-0 cursor-pointer select-none items-center gap-2 border-b border-slate-100 px-3 py-1.5 transition hover:bg-slate-50/60 dark:border-white/6 dark:hover:bg-white/3"
        title={detailsOpen ? "Collapse slider" : "Click to drag progress slider"}
      >
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
          <div
            className="h-1.5 rounded-full bg-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="w-8 shrink-0 text-right text-[11px] font-bold text-accent">{progress}%</span>
        <ChevronUp
          size={12}
          className={`shrink-0 text-slate-300 transition-transform dark:text-slate-600 ${detailsOpen ? "" : "rotate-180"}`}
        />
      </div>

      {/* ── Desktop collapsible details + progress slider ────────── */}
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
          <div>
            <div className="mb-1 flex items-center justify-between text-[11.5px]">
              <span className="font-semibold text-slate-500 dark:text-slate-300">Progress</span>
              <span className="font-bold text-accent">{progress}%</span>
            </div>
            <input type="range" min={0} max={100} value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              onMouseUp={(e) => handleProgressCommit(Number(e.target.value))}
              onTouchEnd={(e) => handleProgressCommit(Number(e.target.value))}
              className="w-full" style={{ accentColor: "#22D3D3" }}
            />
            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-400">Drag to update — client gets a WhatsApp message automatically.</p>
          </div>
          {!isComplete && (
            <button onClick={handleComplete}
              className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600 transition sm:hidden">
              <CheckCircle2 size={13} /> Mark Complete
            </button>
          )}
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

      {/* ── Mobile: Mark Complete / Undo Complete strip (below chat) ── */}
      <div className="shrink-0 border-t border-slate-100 px-3 py-2 dark:border-white/6 sm:hidden">
        {isComplete ? (
          <button onClick={handleUndoComplete}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 py-2.5 text-[13px] font-bold text-emerald-600 hover:bg-emerald-100 transition dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50">
            <CheckCircle2 size={15} /> Completed · Undo
          </button>
        ) : (
          <button onClick={handleComplete}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-600 transition">
            <CheckCircle2 size={15} /> Mark Complete
          </button>
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