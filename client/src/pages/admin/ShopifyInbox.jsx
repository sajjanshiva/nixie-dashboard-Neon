import React, { useEffect, useState } from "react";
import { Check, X as XIcon, ShoppingBag, Tag } from "lucide-react";
import { getShopifyOrders, getShopifyLeads, assignLead, assignOrder, assignTask, getTeamMembers } from "../../lib/api.js";
import Modal from "../../components/Modal.jsx";
import LeadDetails from "../../components/LeadDetails.jsx";
import toast from "react-hot-toast";

// ── Assign control (leads) — mirrors OrderAssignControl/ReassignOrderControl
//    below, minus the phone field (leads already have one on file) ─────────
function AssignControl({ currentAssigneeId, currentAssigneeName, staff, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");

  if (!open) {
    return currentAssigneeId ? (
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
          → Assigned to <span className="font-semibold">{currentAssigneeName || "staff"}</span>
        </span>
        <button
          onClick={() => { setAssigneeId(currentAssigneeId || ""); setOpen(true); }}
          className="shrink-0 text-[11.5px] font-medium text-accent hover:underline"
        >
          Reassign
        </button>
      </div>
    ) : (
      <button
        onClick={() => { setAssigneeId(""); setOpen(true); }}
        className="btn-primary flex-1 py-1.5 text-[12px]"
      >
        Assign
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <select
        autoFocus
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        className="max-w-[130px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
      >
        <option value="">Assign to…</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={() => {
          if (!assigneeId) { toast.error("Pick a staff member"); return; }
          onConfirm(assigneeId);
          setOpen(false);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
        aria-label="Confirm assign"
      >
        <Check size={14} />
      </button>
      <button
        onClick={() => setOpen(false)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
        aria-label="Cancel"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}

// ── Assign control (orders) — needs a phone number too, since the
//    Shopify webhook doesn't always carry a reliable customer phone ───────
function OrderAssignControl({ order, staff, onConfirm, submitting }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(order.customer_phone || "");
  const [assigneeId, setAssigneeId] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-primary flex-1 py-1.5 text-[12px]"
      >
        Assign
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Client phone number"
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
      />
      <div className="flex items-center gap-1.5">
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
        >
          <option value="">Assign to…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!phone.trim() || !assigneeId) {
              toast.error("Enter a phone number and pick a staff member");
              return;
            }
            onConfirm({ phone: phone.trim(), assigneeId });
          }}
          disabled={submitting}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
          aria-label="Confirm assign"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setOpen(false)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          aria-label="Cancel"
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Reassign control — shown once an order already has a task, lets
//    admin move it to a different staff member without touching the
//    phone number or any chat history already on the task ────────────────
function ReassignOrderControl({ currentAssigneeId, currentAssigneeName, staff, onConfirm }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(null);

  if (!editing) {
    return (
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
          → Assigned to <span className="font-semibold">{currentAssigneeName || "staff"}</span>
        </span>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 text-[11.5px] font-medium text-accent hover:underline"
        >
          Reassign
        </button>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="flex flex-1 items-center gap-1.5">
        <span className="flex-1 truncate text-[11.5px] text-slate-600 dark:text-slate-300">
          Move to <span className="font-semibold">{pending.name}</span>?
        </span>
        <button
          onClick={() => { onConfirm(pending.id); setPending(null); setEditing(false); }}
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
          aria-label="Confirm reassign"
        >
          <Check size={13} />
        </button>
        <button
          onClick={() => { setPending(null); setEditing(false); }}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          aria-label="Cancel"
        >
          <XIcon size={13} />
        </button>
      </div>
    );
  }

  return (
    <select
      autoFocus
      value={currentAssigneeId || ""}
      onChange={(e) => {
        const id = e.target.value;
        if (!id || id === currentAssigneeId) { setEditing(false); return; }
        setPending(staff.find((s) => s.id === id));
      }}
      onBlur={() => setEditing(false)}
      className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
    >
      <option value="">Move to…</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

// ── Shared card wrapper ──────────────────────────────────────────────────
function ItemCard({ children }) {
  return (
    <div className="card flex flex-col gap-3 p-4 dark:bg-[#1A1D27]">
      {children}
    </div>
  );
}

export default function ShopifyInbox() {
  // LEADS first, ORDERS second (as requested)
  const [tab, setTab]     = useState("leads");
  const [orders, setOrders] = useState([]);
  const [leads, setLeads]   = useState([]);
  const [staff, setStaff]   = useState([]);
  const [viewingRef, setViewingRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assigningOrderId, setAssigningOrderId] = useState(null);

  useEffect(() => {
    Promise.all([
      getShopifyOrders(),
      getShopifyLeads(),
      getTeamMembers(),
    ]).then(([o, l, m]) => {
      setOrders(o);
      setLeads(l);
      setStaff(m.filter((x) => x.role === "staff"));
    }).finally(() => setLoading(false));
  }, []);

  async function handleAssignOrder(order, { phone, assigneeId }) {
    setAssigningOrderId(order.id);
    try {
      const task = await assignOrder(order, { phone, assigneeId });
      setOrders((os) =>
        os.map((o) =>
          o.id === order.id
            ? { ...o, status: "assigned", task_id: task.id, task: { id: task.id, assignee: task.assignee } }
            : o
        )
      );
      toast.success(`Order assigned to ${task.assignee?.name || "staff"}`);
    } catch (err) {
      toast.error(err.message || "Failed to assign order");
    } finally {
      setAssigningOrderId(null);
    }
  }

  async function handleReassignOrder(order, newAssigneeId) {
    try {
      await assignTask(order.task_id, newAssigneeId);
      const newAssignee = staff.find((s) => s.id === newAssigneeId);
      setOrders((os) =>
        os.map((o) =>
          o.id === order.id
            ? { ...o, task: { ...o.task, assignee: newAssignee } }
            : o
        )
      );
      toast.success(`Moved to ${newAssignee?.name || "staff"}`);
    } catch (err) {
      toast.error(err.message || "Failed to reassign");
    }
  }

  async function handleAssignLead(leadId, assigneeId) {
    await assignLead(leadId, assigneeId || null);
    const newAssignee = assigneeId ? staff.find((s) => s.id === assigneeId) : null;
    setLeads((ls) =>
      ls.map((l) =>
        l.id === leadId
          ? { ...l, assignee_id: assigneeId, assignee: newAssignee, status: assigneeId ? "assigned" : "unassigned" }
          : l
      )
    );
    toast.success(`Lead ${assigneeId ? `assigned to ${newAssignee?.name || "staff"}` : "unassigned"}`);
  }

  const viewing = !viewingRef
    ? null
    : viewingRef.type === "order"
    ? orders.find((o) => o.id === viewingRef.id)
    : leads.find((l) => l.id === viewingRef.id);

  const TABS = [
    { id: "leads",  label: "Leads",  icon: Tag,          count: leads.length },
    { id: "orders", label: "Orders", icon: ShoppingBag,  count: orders.length },
  ];

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <p className="mb-4 text-[12.5px] text-slate-400 dark:text-slate-500">
        New orders and leads arrive automatically from Shopify.
      </p>

      {/* Tabs — Leads first, Orders second */}
      <div className="mb-5 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
              tab === t.id
                ? "bg-accent text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
            }`}
          >
            <t.icon size={14} />
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : tab === "leads" ? (
        /* ── LEADS ── */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leads.length === 0 && (
            <p className="text-[13px] text-slate-400">No leads yet.</p>
          )}
          {leads.map((l) => (
            <ItemCard key={l.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Tag size={12} className="text-amber-500" />
                  <span className="text-[11.5px] font-bold text-amber-600">
                    {l.lead_number || "Lead"}
                  </span>
                </div>
                <span
                  className={`badge capitalize ${
                    l.status === "unassigned" ? "badge-slate" : l.status === "contacted" ? "badge-success" : "badge-accent"
                  }`}
                >
                  {l.status}
                </span>
              </div>

              <div>
                <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">
                  {l.name}
                </p>
                <p className="truncate text-[12px] text-slate-400">
                  {l.outfit_type} · {l.price_estimate}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewingRef({ type: "lead", id: l.id })}
                  className="btn-secondary flex-1 py-1.5 text-[12px]"
                >
                  View Details
                </button>
                <AssignControl
                  currentAssigneeId={l.assignee_id}
                  currentAssigneeName={l.assignee?.name}
                  staff={staff}
                  onConfirm={(id) => handleAssignLead(l.id, id)}
                />
              </div>
            </ItemCard>
          ))}
        </div>
      ) : (
        /* ── ORDERS ── */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.length === 0 && (
            <p className="text-[13px] text-slate-400">No orders yet.</p>
          )}
          {orders.map((o) => (
            <ItemCard key={o.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag size={12} className="text-emerald-500" />
                  <span className="text-[11.5px] font-bold text-emerald-600">
                    {o.order_number || "#"}
                  </span>
                </div>
                <span
                  className={`badge capitalize ${
                    o.task_id ? "badge-accent" : "badge-slate"
                  }`}
                >
                  {o.task_id ? "Assigned" : "Unassigned"}
                </span>
              </div>

              <div>
                <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">
                  {o.customer_name}
                </p>
                <p className="truncate text-[12px] text-slate-400">
                  {o.items} · {o.price}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewingRef({ type: "order", id: o.id })}
                  className="btn-secondary flex-1 py-1.5 text-[12px]"
                >
                  View Details
                </button>

                {o.task_id ? (
                  <ReassignOrderControl
                    currentAssigneeId={o.task?.assignee?.id}
                    currentAssigneeName={o.task?.assignee?.name}
                    staff={staff}
                    onConfirm={(newAssigneeId) => handleReassignOrder(o, newAssigneeId)}
                  />
                ) : (
                  <OrderAssignControl
                    order={o}
                    staff={staff}
                    submitting={assigningOrderId === o.id}
                    onConfirm={(payload) => handleAssignOrder(o, payload)}
                  />
                )}
              </div>
            </ItemCard>
          ))}
        </div>
      )}

      {/* Details modal */}
      <Modal open={!!viewing} onClose={() => setViewingRef(null)}>
        {viewing && (
          <div className="p-5">
            <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-white">
              {viewingRef.type === "lead" ? "Lead Details" : "Order Details"}
            </h3>
            {viewingRef.type === "lead" ? (
              <LeadDetails lead={viewing} />
            ) : (
              <dl className="space-y-2 text-[13px]">
                {Object.entries(viewing)
                  .filter(([k]) => !["id", "task"].includes(k))
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between gap-3 border-b border-slate-50 py-1.5 dark:border-white/6"
                    >
                      <dt className="capitalize text-slate-400">{k.replaceAll("_", " ")}</dt>
                      <dd className="text-right text-slate-700 dark:text-slate-300">{String(v ?? "—")}</dd>
                    </div>
                  ))}
              </dl>
            )}
            <p className="mt-4 text-[11.5px] text-slate-400">
              Read-only — data is fetched automatically from Shopify.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}