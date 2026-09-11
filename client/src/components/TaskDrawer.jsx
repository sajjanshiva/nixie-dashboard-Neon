import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import TaskConversation from "./TaskConversation.jsx";
import MobileTaskInfo from "./MobileTaskInfo.jsx";

// Resizable slide-in drawer, shared by Admin's All Tasks and Staff's My
// Tasks so both behave identically:
//  - Desktop (md+): resizable side panel, goes straight into
//    TaskConversation (unchanged from how Admin always worked).
//  - Mobile: shows MobileTaskInfo first (details + Mark Complete), with
//    an explicit "Open Chat" button to go to the conversation — matching
//    how Staff's My Tasks already worked. Previously Admin skipped this
//    and jumped straight to chat on mobile; that's the bug this fixes.
export default function TaskDrawer({ task, assigneeName, onClose, onProgressChange, width, onWidthChange, staffToggleLabel }) {
  const overlayRef = useRef(null);
  const isDragging  = useRef(false);
  const startX      = useRef(0);
  const startWidth  = useRef(0);

  // mobile-only: "info" | "chat"
  const [mobileView, setMobileView] = useState("info");

  // Reset to the info screen each time a different task is opened.
  useEffect(() => { setMobileView("info"); }, [task?.id]);

  const startResize = useCallback((e) => {
    isDragging.current = true;
    startX.current     = e.clientX;
    startWidth.current = width;
    document.body.style.cursor       = "ew-resize";
    document.body.style.userSelect   = "none";

    function onMove(ev) {
      if (!isDragging.current) return;
      const delta  = startX.current - ev.clientX;
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

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] animate-fade-in"
      />

      <div
        className="fixed inset-y-0 right-0 z-40 flex flex-col bg-white shadow-2xl dark:bg-[#13151F] animate-slide-in-right"
        style={{ width: window.innerWidth < 768 ? "100%" : `${width}px` }}
      >
        {/* Drag handle — desktop only */}
        <div
          onMouseDown={startResize}
          className="absolute inset-y-0 left-0 hidden w-1.5 cursor-ew-resize items-center justify-center md:flex group"
          title="Drag to resize"
        >
          <div className="h-12 w-1 rounded-full bg-slate-200 group-hover:bg-accent transition dark:bg-slate-700" />
        </div>

        {/* ── Desktop: top bar + straight into TaskConversation (unchanged) ── */}
        <div className="hidden h-full flex-col md:flex">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5 pl-5 dark:border-white/6">
            <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Task Details</p>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/8"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <TaskConversation task={task} staffToggleLabel={staffToggleLabel} onProgressChange={onProgressChange} />
          </div>
        </div>

        {/* ── Mobile: info screen first, then chat ── */}
        <div className="flex h-full flex-col md:hidden">
          {mobileView === "info" ? (
            <MobileTaskInfo
              task={task}
              assigneeName={assigneeName}
              onBack={onClose}
              onOpenChat={() => setMobileView("chat")}
              onProgressChange={onProgressChange}
            />
          ) : (
            <TaskConversation
              task={task}
              staffToggleLabel={staffToggleLabel}
              onBack={() => setMobileView("info")}
              onProgressChange={onProgressChange}
            />
          )}
        </div>
      </div>
    </>
  );
}