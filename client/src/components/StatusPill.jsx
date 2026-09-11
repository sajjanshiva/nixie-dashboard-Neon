import React from "react";
import { Check, XCircle, Clock } from "lucide-react";

export default function StatusPill({ status }) {
  const map = {
    approved: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", Icon: Check, label: "Approved" },
    rejected: { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-600 dark:text-rose-400", Icon: XCircle, label: "Rejected" },
    pending: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", Icon: Clock, label: "Pending" },
  };
  const s = map[status] || map.pending;
  const { Icon } = s;
  return (
    <span className={`flex items-center gap-1 rounded-full ${s.bg} ${s.text} px-2 py-0.5 text-[11px] font-medium shrink-0`}>
      <Icon size={11} />
      {s.label}
    </span>
  );
}
