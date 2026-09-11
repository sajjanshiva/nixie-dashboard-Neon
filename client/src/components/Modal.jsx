import React from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        className={`relative h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-[#1A1D27] sm:h-[85vh] sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15 dark:hover:text-slate-200"
        >
          <X size={18} />
        </button>
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}