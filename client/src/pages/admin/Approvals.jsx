import React, { useEffect, useState } from "react";
import {
  Plane, Receipt, Check, X, ChevronDown, ChevronUp, Clock,
  CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import {
  getLeaves, getReimbursements, decideLeave, decideReimbursement,
} from "../../lib/api.js";

// ── Status badge ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === "approved") return (
    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
      <CheckCircle2 size={12} /> Approved
    </span>
  );
  if (status === "rejected") return (
    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11.5px] font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-400">
      <XCircle size={12} /> Rejected
    </span>
  );
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
      <Clock size={12} /> Pending
    </span>
  );
}

// ── Inline rejection reason form ──────────────────────────────────────
function RejectForm({ onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 animate-fade-in">
      <textarea
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for rejecting…"
        rows={2}
        className="mb-2 w-full resize-none rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] outline-none placeholder:text-rose-300 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(reason)}
          disabled={!reason.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
        >
          <Check size={12} /> Confirm Reject
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Single request card ───────────────────────────────────────────────
function RequestCard({ item, kind, onDecide }) {
  const [confirming, setConfirming] = useState(false); // true = "Confirm approve?" inline
  const [rejecting, setRejecting]   = useState(false); // true = show reject reason form
  const isPending = item.status === "pending";

  return (
    <div className="card flex flex-col gap-3 p-4 dark:bg-[#1A1D27]">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100">
            {item.staff?.name || item.staffName || "Staff"}
          </p>
          <p className="text-[12px] text-slate-400">
            {kind === "leave"
              ? `${item.type} · ${item.date_from} → ${item.date_to}`
              : `${item.category} · ₹${item.amount}`}
          </p>
          {(item.reason || item.note) && (
            <p className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300">{item.reason || item.note}</p>
          )}
          {item.status === "rejected" && item.reject_reason && (
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-rose-500">
              <AlertCircle size={11} /> {item.reject_reason}
            </p>
          )}
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Actions — only for pending */}
      {isPending && !confirming && !rejecting && (
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-[12.5px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
          >
            <CheckCircle2 size={14} /> Approve
          </button>
          <button
            onClick={() => setRejecting(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-[12.5px] font-semibold text-rose-600 transition hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50"
          >
            <XCircle size={14} /> Reject
          </button>
        </div>
      )}

      {/* Approve confirmation inline */}
      {confirming && (
        <div className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="mb-2 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400">
            Approve this request?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { onDecide(item.id, "approved"); setConfirming(false); }}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
            >
              <Check size={12} /> Yes, approve
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject form */}
      {rejecting && (
        <RejectForm
          onConfirm={(reason) => { onDecide(item.id, "rejected", reason); setRejecting(false); }}
          onCancel={() => setRejecting(false)}
        />
      )}
    </div>
  );
}

// ── Status filter dropdown ────────────────────────────────────────────
function StatusDropdown({ value, onChange, counts }) {
  const [open, setOpen] = useState(false);
  const opts = ["pending", "approved", "rejected"];
  const labels = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
      >
        <span className={`h-2 w-2 rounded-full ${
          value === "approved" ? "bg-emerald-500" : value === "rejected" ? "bg-red-500" : "bg-amber-400"
        }`} />
        {labels[value]}
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {counts[value] ?? 0}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl dark:border-white/8 dark:bg-[#1A1D27] animate-fade-in">
            {opts.map((o) => (
              <button
                key={o}
                onClick={() => { onChange(o); setOpen(false); }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                  value === o ? "bg-accent/5 font-semibold text-accent-text dark:bg-accent/10 dark:text-accent" : "text-slate-700 dark:text-slate-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${
                    o === "approved" ? "bg-emerald-500" : o === "rejected" ? "bg-red-500" : "bg-amber-400"
                  }`} />
                  {labels[o]}
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 text-[10.5px] font-bold text-slate-500 dark:bg-white/10">
                  {counts[o] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Approvals() {
  const [tab, setTab]               = useState("leaves");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [leaves, setLeaves]         = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([getLeaves(), getReimbursements()])
      .then(([l, r]) => { setLeaves(l); setReimbursements(r); })
      .finally(() => setLoading(false));
  }, []);

  async function handleDecideLeave(id, status, rejectReason) {
    await decideLeave(id, status, rejectReason || null);
    setLeaves((ls) => ls.map((l) => l.id === id ? { ...l, status, reject_reason: rejectReason || null } : l));
  }
  async function handleDecideReimburse(id, status, rejectReason) {
    await decideReimbursement(id, status, rejectReason || null);
    setReimbursements((rs) => rs.map((r) => r.id === id ? { ...r, status, reject_reason: rejectReason || null } : r));
  }

  const list     = tab === "leaves" ? leaves : reimbursements;
  const filtered = list.filter((i) => i.status === statusFilter);

  // Counts per status for the current tab
  const counts = { pending: 0, approved: 0, rejected: 0 };
  list.forEach((i) => { if (i.status in counts) counts[i.status]++; });

  const TABS = [
    { id: "leaves",       label: "Leaves",         icon: Plane,    count: leaves.length },
    { id: "reimburse",    label: "Reimbursements",  icon: Receipt,  count: reimbursements.length },
  ];

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      {/* Tabs + status filter on same row */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* Tab switcher */}
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
                tab === t.id
                  ? "bg-accent text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              }`}
            >
              <t.icon size={14} />
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Status dropdown */}
        <StatusDropdown value={statusFilter} onChange={setStatusFilter} counts={counts} />
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 py-14 text-center dark:border-white/6">
          <div className="mb-3 rounded-2xl bg-slate-100 p-4 dark:bg-white/6">
            {tab === "leaves" ? <Plane size={28} className="text-slate-300" /> : <Receipt size={28} className="text-slate-300" />}
          </div>
          <p className="text-[14px] font-semibold text-slate-500">
            No {statusFilter} {tab === "leaves" ? "leaves" : "reimbursements"}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            Use the dropdown above to view other statuses
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tab === "leaves"
            ? filtered.map((l) => <RequestCard key={l.id} item={l} kind="leave"     onDecide={handleDecideLeave} />)
            : filtered.map((r) => <RequestCard key={r.id} item={r} kind="reimburse" onDecide={handleDecideReimburse} />)
          }
        </div>
      )}
    </div>
  );
}
