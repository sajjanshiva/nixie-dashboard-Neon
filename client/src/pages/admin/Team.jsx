import React, { useEffect, useState } from "react";
import { UserPlus, ClipboardPlus, X, Mail, Clock, Trash2 } from "lucide-react";
import { getTeamMembers, inviteTeamMember, cancelInvite, createTask, getCustomRoles } from "../../lib/api.js";
import Avatar from "../../components/Avatar.jsx";
import Modal from "../../components/Modal.jsx";
import toast from "react-hot-toast";

// Replaces the old AddMemberForm (name + email + password). Admin no
// longer sets a password or name directly — just email + role (+ an
// optional title), and an invite email goes out with a link for the
// person to set their own name and password. As decided, the profile
// row (and this list) shows them immediately as "pending" rather than
// waiting for them to accept.
//
// Two dropdowns: "Access level" (Admin/Staff — the real permission,
// unchanged) and "Role" (an optional cosmetic title, admin-managed in
// Settings). The Role dropdown only makes sense for Staff — Admin is
// already a fixed, singular role — so it's hidden whenever Access level
// is Admin, and resets to blank so a stale pick never gets sent.
function InviteMemberForm({ onDone }) {
  const [form, setForm] = useState({ email: "", role: "staff", title: "" });
  const [customRoles, setCustomRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCustomRoles()
      .then(setCustomRoles)
      .catch((err) => console.warn("Could not load custom roles:", err));
  }, []);

  function handleAccessChange(role) {
    setForm((f) => ({ ...f, role, title: role === "admin" ? "" : f.title }));
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await inviteTeamMember({ email: form.email, role: form.role, title: form.role === "staff" ? (form.title || null) : null });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5">
      <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-white">Invite Team Member</h3>
      <div className="space-y-3">
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />

        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-400">Access level</label>
          <select value={form.role} onChange={(e) => handleAccessChange(e.target.value)} className="input">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {form.role === "staff" && (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-400">Role (optional)</label>
            <select value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input">
              <option value="">No specific role</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
            {customRoles.length === 0 && (
              <p className="mt-1 text-[11px] text-slate-400">No custom roles yet — add some in Settings.</p>
            )}
          </div>
        )}

        <p className="text-[11.5px] text-slate-400">
          They'll get an email with a link to set their own name and password. The link is valid for 7 days.
        </p>
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
        <button onClick={submit} disabled={saving || !form.email} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">
          {saving ? "Sending invite…" : "Send Invite"}
        </button>
      </div>
    </div>
  );
}

function NewTaskForm({ members, onDone }) {
  const [form, setForm] = useState({ title: "", description: "", client_name: "", client_phone: "", due_date: "", links: "", assignee_id: "" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await createTask({ ...form, assignee_id: form.assignee_id || null, source: "manual" });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5">
      <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-white">Create Task</h3>
      <div className="space-y-3">
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
        <textarea placeholder="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input resize-none" />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Client name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="input" />
          <input placeholder="Client phone" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} className="input" />
        </div>
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" />
        <textarea placeholder="Links (one per line)" rows={2} value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} className="input resize-none" />
        {/* An assignee is now required — previously a task could be
            created with nobody assigned, silently invisible to any
            staff member. "Unassigned" option removed; the placeholder
            option can't be re-selected once a choice is made. */}
        <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} className="input">
          <option value="" disabled>Assign to…</option>
          {/* Pending invites have no name yet, so only active staff show up here */}
          {members.filter((m) => m.role === "staff" && !m.pending).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button onClick={submit} disabled={saving || !form.title || !form.assignee_id} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

function PendingCard({ m, onRemoved }) {
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!confirm(`Cancel the invite for ${m.email}? You can re-invite the same email afterward to resend it.`)) return;
    setRemoving(true);
    try {
      await cancelInvite(m.id);
      onRemoved();
    } catch (e) {
      toast.error(e.message || "Failed to cancel invite");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
        <Mail size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{m.email}</p>
        <p className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <Clock size={11} /> Invite sent — hasn't set password yet
        </p>
        <p className="text-[11px] font-medium capitalize text-accent-text">{m.title || m.role}</p>
      </div>
      <button
        onClick={remove}
        disabled={removing}
        title="Cancel invite"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function Team() {
  const [members, setMembers] = useState([]);
  const [modal, setModal] = useState(null); // "member" | "task" | null

  function reload() {
    getTeamMembers()
      .then(setMembers)
      .catch((err) => toast.error(err.message || "Failed to load team members"));
  }
  useEffect(reload, []);

  const pending = members.filter((m) => m.pending);
  const active = members.filter((m) => !m.pending);

  return (
    <div className="px-4 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-slate-400">Manage members and create tasks.</p>
        <div className="flex gap-2">
          <button onClick={() => setModal("task")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
            <ClipboardPlus size={14} /> New Task
          </button>
          <button onClick={() => setModal("member")} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium text-white hover:opacity-90">
            <UserPlus size={14} /> Invite Member
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pending ({pending.length})</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((m) => (
              <PendingCard key={m.id} m={m} onRemoved={reload} />
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          {pending.length > 0 && <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Team Members ({active.length})</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 dark:border-white/8 dark:bg-[#1A1D27]">
                <Avatar name={m.name} className="h-9 w-9 text-[12px]" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
                  <p className="truncate text-[11.5px] text-slate-400">{m.email}</p>
                  <p className="text-[11px] font-medium capitalize text-accent-text">{m.title || m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => { setModal(null); reload(); }}>
        {modal === "member" && <InviteMemberForm onDone={() => { setModal(null); reload(); }} />}
        {modal === "task" && <NewTaskForm members={members} onDone={() => { setModal(null); reload(); }} />}
      </Modal>
    </div>
  );
}