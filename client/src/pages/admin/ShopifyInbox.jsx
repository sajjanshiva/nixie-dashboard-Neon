import React, { useEffect, useState } from "react";
import { Check, X as XIcon, ShoppingBag, Tag, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getShopifyOrders, getShopifyLeads, assignLead, assignOrder, assignTask, getTeamMembers, syncShopifyInbox } from "../../lib/api.js";
import Modal from "../../components/Modal.jsx";
import LeadDetails from "../../components/LeadDetails.jsx";
import toast from "react-hot-toast";

const PAGE_SIZE = 24;

// ── Assign control (leads) — mirrors OrderAssignControl/ReassignOrderControl
//    below, minus the phone field (leads already have one on file) ─────────
function AssignControl({ currentAssigneeId, staff, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");

  const assignedStaff = staff.find((s) => s.id === currentAssigneeId);

  if (!open) {
    return assignedStaff ? (
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
          → Assigned to <span className="font-semibold">{assignedStaff.name}</span>
        </span>
        <button
          onClick={() => { setAssigneeId(assignedStaff.id); setOpen(true); }}
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
          if (!assigneeId || !staff.some((s) => s.id === assigneeId)) {
            toast.error("Pick a staff member");
            return;
          }
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
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-danger text-white hover:bg-danger/90"
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
        onClick={() => {
          setAssigneeId("");
          setPhone(order.customer_phone || "");
          setOpen(true);
        }}
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
            if (!phone.trim() || !assigneeId || !staff.some((s) => s.id === assigneeId)) {
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-danger text-white hover:bg-danger/90"
          aria-label="Cancel"
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Reassign control — shown once an order already has a valid task & assignee,
//    lets admin move it to a different staff member
function ReassignOrderControl({ assignedStaff, staff, onConfirm }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(null);

  if (!editing) {
    return (
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
          → Assigned to <span className="font-semibold">{assignedStaff.name}</span>
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
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-danger text-white hover:bg-danger/90"
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
      value={assignedStaff.id}
      onChange={(e) => {
        const id = e.target.value;
        if (!id || id === assignedStaff.id) { setEditing(false); return; }
        const found = staff.find((s) => s.id === id);
        if (found) setPending(found);
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

// ── Shared pager — same look as AllTasks.jsx's Prev/Next ───────────────
function Pager({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
      >
        <ChevronRight size={15} />
      </button>
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
  // FIX (bug 1): separate loading flags per tab instead of one shared
  // `loading` — previously both the leads and orders effects toggled the
  // same flag, so whichever fetch finished first flipped it to false
  // while the other tab's data (or even the active tab's, on first load)
  // was still in flight, causing a flicker/empty-list flash. Each tab
  // now only reacts to its own loading state.
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Independent pagination per tab — switching tabs doesn't reset the
  // other tab's page.
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsTotal, setLeadsTotal] = useState(0);

  // Team list — fetched once.
  useEffect(() => {
    getTeamMembers()
      .then((m) => {
        const list = Array.isArray(m) ? m : [];
        setStaff(list.filter((x) => x.role === "staff" && !x.pending && x.name));
      })
      .catch((err) => {
        console.error(err);
        setStaff([]);
      });
  }, []);

  function loadLeads(page) {
    setLoadingLeads(true);
    return getShopifyLeads({ page, pageSize: PAGE_SIZE })
      .then((data) => {
        setLeads(data?.leads || []);
        setLeadsTotal(data?.total || 0);
        setLeadsTotalPages(data?.totalPages || 1);
      })
      .catch((err) => {
        console.error(err);
        toast.error(err.message || "Failed to load leads");
        setLeads([]);
      })
      .finally(() => setLoadingLeads(false));
  }

  function loadOrders(page) {
    setLoadingOrders(true);
    return getShopifyOrders({ page, pageSize: PAGE_SIZE })
      .then((data) => {
        setOrders(data?.orders || []);
        setOrdersTotal(data?.total || 0);
        setOrdersTotalPages(data?.totalPages || 1);
      })
      .catch((err) => {
        console.error(err);
        toast.error(err.message || "Failed to load orders");
        setOrders([]);
      })
      .finally(() => setLoadingOrders(false));
  }

  // Leads — refetch on page change.
  useEffect(() => { loadLeads(leadsPage); }, [leadsPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Orders — refetch on page change.
  useEffect(() => { loadOrders(ordersPage); }, [ordersPage]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAssignOrder(order, { phone, assigneeId }) {
    setAssigningOrderId(order.id);
    try {
      const task = await assignOrder(order, { phone, assigneeId });
      const assigned = staff.find((s) => s.id === assigneeId);
      const assignedName = assigned?.name || task.assignee?.name || "";
      setOrders((os) =>
        os.map((o) =>
          o.id === order.id
            ? {
                ...o,
                customer_phone: phone,
                status: "assigned",
                task_id: task.id,
                task: { id: task.id, assignee: assigned || task.assignee },
              }
            : o
        )
      );
      toast.success(assignedName ? `Order assigned to ${assignedName}` : "Order assigned");
      // FIX (bug 2): re-sync totals/pagination from the server after an
      // action, same as Approvals.jsx's refreshTick pattern. Assigning
      // doesn't change how many rows exist today, but this keeps the
      // page's numbers always server-truth instead of silently drifting
      // if this page ever grows a status filter (like Approvals has).
      loadOrders(ordersPage);
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
      toast.success(newAssignee?.name ? `Moved to ${newAssignee.name}` : "Order reassigned");
      loadOrders(ordersPage);
    } catch (err) {
      toast.error(err.message || "Failed to reassign");
    }
  }

  async function handleSyncFromShopify() {
    setSyncing(true);
    try {
      const result = await syncShopifyInbox();
      const leadN = result?.leads?.imported || 0;
      const orderN = result?.orders?.imported || 0;
      toast.success(
        leadN + orderN === 0
          ? "Already up to date with Shopify"
          : `Imported ${leadN} lead${leadN === 1 ? "" : "s"} and ${orderN} order${orderN === 1 ? "" : "s"}`
      );
      setLeadsPage(1);
      setOrdersPage(1);
      await Promise.all([loadLeads(1), loadOrders(1)]);
    } catch (err) {
      toast.error(err.message || "Failed to sync from Shopify");
    } finally {
      setSyncing(false);
    }
  }

  async function handleAssignLead(leadId, assigneeId) {
    try {
      await assignLead(leadId, assigneeId || null);
      const newAssignee = assigneeId ? staff.find((s) => s.id === assigneeId) : null;
      setLeads((ls) =>
        ls.map((l) =>
          l.id === leadId
            ? { ...l, assignee_id: assigneeId, assignee: newAssignee, status: assigneeId ? "assigned" : "unassigned" }
            : l
        )
      );
      if (newAssignee) {
        toast.success(`Lead assigned to ${newAssignee.name}`);
      } else {
        toast.success("Lead unassigned");
      }
      loadLeads(leadsPage);
    } catch (err) {
      toast.error(err.message || "Failed to assign lead");
    }
  }

  const viewing = !viewingRef
    ? null
    : viewingRef.type === "order"
    ? orders.find((o) => o.id === viewingRef.id)
    : leads.find((l) => l.id === viewingRef.id);

  const TABS = [
    { id: "leads",  label: "Leads",  icon: Tag,          count: leadsTotal },
    { id: "orders", label: "Orders", icon: ShoppingBag,  count: ordersTotal },
  ];

  // Which loading flag applies to the tab currently on screen.
  const loading = tab === "leads" ? loadingLeads : loadingOrders;

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
          New orders and leads arrive automatically from Shopify. Use sync to import anything created before this dashboard went live.
        </p>
        <button
          type="button"
          onClick={handleSyncFromShopify}
          disabled={syncing}
          className="btn-secondary inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 text-[12.5px] disabled:opacity-50"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync from Shopify"}
        </button>
      </div>

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

      {/* Loading skeletons — only for the tab actually on screen */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : tab === "leads" ? (
        /* ── LEADS ── */
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leads.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-white/10">
                <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">No leads yet</p>
                <p className="mt-1 text-[12.5px] text-slate-400">
                  New leads appear here when Shopify sends a draft-order webhook.
                </p>
              </div>
            )}
            {leads.map((l) => {
              const assignedStaff = staff.find((s) => s.id === (l.assignee_id || l.assignee?.id));
              const isAssigned = Boolean(assignedStaff);

              return (
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
                        !isAssigned
                          ? "badge-slate"
                          : l.status === "contacted"
                          ? "badge-success"
                          : "badge-accent"
                      }`}
                    >
                      {!isAssigned ? "unassigned" : l.status}
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
                      currentAssigneeId={assignedStaff?.id}
                      staff={staff}
                      onConfirm={(id) => handleAssignLead(l.id, id)}
                    />
                  </div>
                </ItemCard>
              );
            })}
          </div>
          <Pager
            page={leadsPage}
            totalPages={leadsTotalPages}
            onPrev={() => setLeadsPage((p) => Math.max(1, p - 1))}
            onNext={() => setLeadsPage((p) => Math.min(leadsTotalPages, p + 1))}
          />
        </>
      ) : (
        /* ── ORDERS ── */
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-white/10">
                <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">No orders yet</p>
                <p className="mt-1 text-[12.5px] text-slate-400">
                  New paid orders appear here when Shopify sends an orders-paid webhook.
                </p>
              </div>
            )}
            {orders.map((o) => {
              const assignedStaff = staff.find((s) => s.id === o.task?.assignee?.id);
              const isOrderAssigned = Boolean(o.task_id && assignedStaff);

              return (
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
                        isOrderAssigned ? "badge-accent" : "badge-slate"
                      }`}
                    >
                      {isOrderAssigned ? "Assigned" : "Unassigned"}
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

                    {isOrderAssigned ? (
                      <ReassignOrderControl
                        assignedStaff={assignedStaff}
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
              );
            })}
          </div>
          <Pager
            page={ordersPage}
            totalPages={ordersTotalPages}
            onPrev={() => setOrdersPage((p) => Math.max(1, p - 1))}
            onNext={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))}
          />
        </>
      )}

      {/* Details modal */}
      <Modal open={!!viewing} onClose={() => setViewingRef(null)} wide={viewingRef?.type === "lead" && !!viewing?.image_url}>
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