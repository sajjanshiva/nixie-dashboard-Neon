import React, { useEffect, useState } from "react";
import { Receipt, Plus, Upload } from "lucide-react";
import { useAuth } from "../../lib/AuthContext.jsx";
import { getReimbursements, submitReimbursement, getImageKitAuthParams } from "../../lib/api.js";
import StatusPill from "../../components/StatusPill.jsx";
import Modal from "../../components/Modal.jsx";
import ReceiptModal from "../../components/ReceiptModal.jsx";

const IK_URL_ENDPOINT = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT;
const IK_PUBLIC_KEY = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;

async function uploadReceipt(file) {
  const { signature, token, expire } = await getImageKitAuthParams();
  const body = new FormData();
  body.append("file", file);
  body.append("fileName", file.name);
  body.append("publicKey", IK_PUBLIC_KEY);
  body.append("signature", signature);
  body.append("token", token);
  body.append("expire", expire);
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", body });
  if (!res.ok) throw new Error("Receipt upload failed");
  const data = await res.json();
  return data.url;
}

export default function Reimbursements() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "Travel", amount: "", note: "", expense_date: new Date().toISOString().slice(0, 10) });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [error, setError] = useState("");

  function reload() {
    if (user) getReimbursements({ staffId: user.id }).then(setItems);
  }
  useEffect(reload, [user]);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      let receiptUrl = null;
      if (file) receiptUrl = await uploadReceipt(file);
      await submitReimbursement({
        staff_id: user.id,
        category: form.category,
        amount: Number(form.amount),
        note: form.note,
        receipt_url: receiptUrl,
        expense_date: form.expense_date,
      });
      setOpen(false);
      setForm({ category: "Travel", amount: "", note: "", expense_date: new Date().toISOString().slice(0, 10) });
      setFile(null);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-slate-400">Expenses you've submitted for approval.</p>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium text-white">
          <Plus size={14} /> New Expense
        </button>
      </div>

      <div className="space-y-2.5">
        {items.length === 0 ? (
          <p className="text-[13px] text-slate-400">No expenses yet.</p>
        ) : (
          items.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3.5 dark:border-white/8 dark:bg-[#1A1D27]">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400"><Receipt size={14} /></span>
                <div>
                  <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{r.category} · ₹{r.amount}</p>
                  <p className="text-[11.5px] text-slate-400">
                    {r.expense_date && `Expense: ${new Date(`${r.expense_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                    {r.expense_date && " · "}
                    Submitted: {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">{r.note}</p>
                  {r.receipt_url && (
                    <button
                      onClick={() => setViewingReceipt(r.receipt_url)}
                      className="text-[11.5px] text-accent hover:underline"
                    >
                      View receipt
                    </button>
                  )}
                  {r.status === "rejected" && r.reject_reason && (
                    <p className="mt-1 text-[11.5px] text-rose-500 dark:text-rose-400">Reason: {r.reject_reason}</p>
                  )}
                </div>
              </div>
              <StatusPill status={r.status} />
            </div>
          ))
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="p-5">
          <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-white">New Expense</h3>
          <div className="space-y-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
              <option>Travel</option><option>Food</option><option>Supplies</option><option>Other</option>
            </select>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">Date of expense</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="input" />
            </div>
            <input type="number" placeholder="Amount (₹)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
            <textarea rows={2} placeholder="What was this expense for?" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input resize-none" />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-[12.5px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
              <Upload size={14} />
              {file ? file.name : "Upload receipt image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {error && <p className="text-[12px] text-rose-600">{error}</p>}
            <button onClick={submit} disabled={saving || !form.amount || !form.note.trim() || !form.expense_date} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">
              {saving ? "Submitting…" : "Submit expense"}
            </button>
          </div>
        </div>
      </Modal>

      <ReceiptModal url={viewingReceipt} onClose={() => setViewingReceipt(null)} />
    </div>
  );
}