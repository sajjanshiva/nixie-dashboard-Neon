import React, { useEffect, useState } from "react";
import { Plane, Plus } from "lucide-react";
import { useAuth } from "../../lib/AuthContext.jsx";
import { getLeaves, submitLeave } from "../../lib/api.js";
import StatusPill from "../../components/StatusPill.jsx";
import Modal from "../../components/Modal.jsx";

const REASON_CATEGORIES = ["Personal", "Health", "Travel", "Family", "Other"];

export default function Leave() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "Casual", reasonCategory: REASON_CATEGORIES[0], reason: "", from: "", to: "" });
  const [saving, setSaving] = useState(false);

  function reload() {
    if (user) getLeaves({ staffId: user.id }).then(setLeaves);
  }
  useEffect(reload, [user]);

  async function submit() {
    setSaving(true);
    try {
      await submitLeave({
        staff_id: user.id,
        type: form.type,
        reason_category: form.reasonCategory,
        reason: form.reason,
        date_from: form.from,
        date_to: form.to,
      });
      setOpen(false);
      setForm({ type: "Casual", reasonCategory: REASON_CATEGORIES[0], reason: "", from: "", to: "" });
      reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-slate-400">Your leave history and pending requests.</p>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium text-white">
          <Plus size={14} /> Request Leave
        </button>
      </div>

      <div className="space-y-2.5">
        {leaves.length === 0 ? (
          <p className="text-[13px] text-slate-400">No leave requests yet.</p>
        ) : (
          leaves.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3.5 dark:border-white/8 dark:bg-[#1A1D27]">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><Plane size={14} /></span>
                <div>
                  <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{l.type} leave</p>
                  <p className="text-[12px] text-slate-400">{l.date_from} → {l.date_to}</p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">{l.reason}</p>
                  {l.status === "rejected" && l.reject_reason && (
                    <p className="mt-1 text-[11.5px] text-rose-500 dark:text-rose-400">Reason: {l.reject_reason}</p>
                  )}
                </div>
              </div>
              <StatusPill status={l.status} />
            </div>
          ))
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="p-5">
          <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-white">Request Leave</h3>
          <div className="space-y-3">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              <option>Casual</option><option>Sick</option><option>Earned</option>
            </select>
            <select value={form.reasonCategory} onChange={(e) => setForm({ ...form, reasonCategory: e.target.value })} className="input">
              {REASON_CATEGORIES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="input" />
              <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="input" />
            </div>
            <textarea rows={2} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input resize-none" />
            <button onClick={submit} disabled={saving || !form.from || !form.to || !form.reason.trim()} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">
              {saving ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
