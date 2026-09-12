import React, { useEffect, useState } from "react";
import { Target, Check } from "lucide-react";
import { useAuth } from "../../lib/AuthContext.jsx";
import { getShopifyLeads, markLeadContacted } from "../../lib/api.js";
import Modal from "../../components/Modal.jsx";
import LeadDetails from "../../components/LeadDetails.jsx";

const BATCH_SIZE = 18;

function StatusBadge({ status }) {
  const map = {
    assigned: "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400",
    contacted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${map[status] || map.assigned}`}>
      {status}
    </span>
  );
}

export default function MyLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [viewingId, setViewingId] = useState(null);
  const [marking, setMarking] = useState(false);

  // "Load more" pagination — server-side page/pageSize now, instead of
  // fetching this staff member's entire lead history in one shot.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fresh load (user changes, or on mount) — resets to page 1 and
  // replaces the list rather than appending.
  useEffect(() => {
    if (!user) return;
    setPage(1);
    getShopifyLeads({ assigneeId: user.id, page: 1, pageSize: BATCH_SIZE }).then((data) => {
      setLeads(data.leads || []);
      setTotalPages(data.totalPages || 1);
    });
  }, [user]);

  function loadMore() {
    if (!user || page >= totalPages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    getShopifyLeads({ assigneeId: user.id, page: nextPage, pageSize: BATCH_SIZE })
      .then((data) => {
        setLeads((prev) => [...prev, ...(data.leads || [])]);
        setTotalPages(data.totalPages || 1);
        setPage(nextPage);
      })
      .finally(() => setLoadingMore(false));
  }

  const viewing = leads.find((l) => l.id === viewingId) || null;

  async function handleMarkContacted(leadId) {
    setMarking(true);
    try {
      await markLeadContacted(leadId);
      setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, status: "contacted" } : l)));
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-6">
      <p className="mb-4 text-[12.5px] text-slate-400">Leads assigned to you — follow up and mark them contacted.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leads.length === 0 ? (
          <p className="text-[13px] text-slate-400">No leads assigned to you yet.</p>
        ) : (
          leads.map((l) => (
            <div key={l.id} className="rounded-xl border border-slate-100 bg-white p-3.5 dark:border-white/8 dark:bg-[#1A1D27]">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <Target size={12} />
                  {l.lead_number || "Lead"}
                </span>
                <StatusBadge status={l.status} />
              </div>
              <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{l.name || "—"}</p>
              <p className="mb-2.5 truncate text-[12px] text-slate-400">{l.outfit_type} · ₹{l.price_estimate}</p>
              <div className="flex gap-2">
                <button onClick={() => setViewingId(l.id)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
                  View Details
                </button>
                {l.status !== "contacted" && (
                  <button
                    onClick={() => handleMarkContacted(l.id)}
                    disabled={marking}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check size={12} /> Contacted
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {page < totalPages && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-slate-200 px-4 py-2 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewingId(null)}>
        {viewing && (
          <div className="p-5">
            <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-white">Lead Details</h3>
            <LeadDetails lead={viewing} />
            {viewing.status !== "contacted" && (
              <button
                onClick={() => handleMarkContacted(viewing.id)}
                disabled={marking}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-[13px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={14} /> Mark Contacted
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}