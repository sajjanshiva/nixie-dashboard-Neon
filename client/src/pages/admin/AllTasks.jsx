import React, { useEffect, useState } from "react";
import { ShoppingBag, Tag, ChevronRight, Trash2, ChevronLeft, Search, X } from "lucide-react";
import { getTasks, deleteTask, getTeamMembers, getStageFromTask } from "../../lib/api.js";
import TaskDrawer from "../../components/TaskDrawer.jsx";

const FILTERS = ["All", "In Progress", "On Hold", "Complete", "Unassigned"];
const PAGE_SIZE = 24;

function SourceIcon({ source }) {
  if (source === "shopify_order") return <ShoppingBag size={12} className="text-emerald-500" />;
  if (source === "shopify_lead")  return <Tag size={12} className="text-amber-400" />;
  return null;
}

export default function AllTasks() {
  const [tasks, setTasks]             = useState([]);
  const [total, setTotal]             = useState(0);
  const [totalPages, setTotalPages]   = useState(1);
  const [counts, setCounts]           = useState({ All: 0, "In Progress": 0, "On Hold": 0, Complete: 0, Unassigned: 0 });
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState("All");
  const [page, setPage]               = useState(1);
  const [openTask, setOpenTask]       = useState(null);
  const [drawerWidth, setDrawerWidth] = useState(520);

  // New Filters
  const [staffList, setStaffList]         = useState([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [search, setSearch]               = useState("");

  // Load team members for staff filter
  useEffect(() => {
    getTeamMembers()
      .then((m) => {
        const list = Array.isArray(m) ? m : [];
        setStaffList(list.filter((x) => x.name && !x.pending));
      })
      .catch(() => setStaffList([]));
  }, []);

  // Filter pill counts — derived with current search, staff, and month filters
  useEffect(() => {
    const filterArgs = {
      assigneeId: selectedStaff || undefined,
      month: selectedMonth || undefined,
      search: search || undefined,
    };
    Promise.all([
      getTasks({ ...filterArgs, page: 1, pageSize: 1 }),
      getTasks({ ...filterArgs, status: "In Progress", page: 1, pageSize: 1 }),
      getTasks({ ...filterArgs, status: "On Hold", page: 1, pageSize: 1 }),
      getTasks({ ...filterArgs, status: "Complete", page: 1, pageSize: 1 }),
      getTasks({ ...filterArgs, unassigned: true, page: 1, pageSize: 1 }),
    ]).then(([all, inProgress, onHold, complete, unassigned]) => {
      setCounts({
        All: all.total,
        "In Progress": inProgress.total,
        "On Hold": onHold.total,
        Complete: complete.total,
        Unassigned: unassigned.total,
      });
    }).catch(() => {});
  }, [tasks.length, selectedStaff, selectedMonth, search]);

  // Main task list query — server-side filtered + paginated
  useEffect(() => {
    setLoading(true);
    const isUnassigned = filter === "Unassigned";
    getTasks({
      status: !isUnassigned && filter !== "All" ? filter : undefined,
      unassigned: isUnassigned ? true : undefined,
      assigneeId: selectedStaff || undefined,
      month: selectedMonth || undefined,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        setTasks(data.tasks || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => {
        console.error(err);
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [filter, selectedStaff, selectedMonth, search, page]);

  function handleProgressChange(taskId, progress, status, stage) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? {
      ...t,
      progress,
      ...(status ? { status } : {}),
      ...(stage ? { stage } : {}),
    } : t)));
    setOpenTask((t) => t?.id === taskId ? {
      ...t,
      progress,
      ...(status ? { status } : {}),
      ...(stage ? { stage } : {}),
    } : t);
  }

  async function handleDelete(e, task) {
    e.stopPropagation();
    if (!confirm(`Delete "${task.title}"? This also deletes its chat history and can't be undone.`)) return;
    try {
      await deleteTask(task.id);
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      setOpenTask((t) => t?.id === task.id ? null : t);
    } catch (err) {
      alert(err.message || "Failed to delete task");
    }
  }

  function handleClearFilters() {
    setFilter("All");
    setSelectedStaff("");
    setSelectedMonth("");
    setSearch("");
    setPage(1);
  }

  const hasActiveFilters = Boolean(filter !== "All" || selectedStaff || selectedMonth || search);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
          {total} tasks · updates sync automatically
        </p>
      </div>

      {/* ── Status Pills ── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
              filter === f
                ? "bg-accent text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
            }`}
          >
            {f}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              filter === f ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
            }`}>
              {counts[f] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Search, Staff & Date Filters Bar ── */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm dark:border-white/8 dark:bg-[#1A1D27]">
        {/* Client Search */}
        <div className="relative flex-1 min-w-[210px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search client name, phone or title…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-9 pr-7 text-[12.5px] font-medium text-slate-700 outline-none focus:border-accent dark:border-white/10 dark:bg-white/5 dark:text-slate-300 placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Staff Filter */}
        <select
          value={selectedStaff}
          onChange={(e) => { setSelectedStaff(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 outline-none focus:border-accent dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
        >
          <option value="">All Staff</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Month/Year Filter */}
        <div className="flex items-center gap-1.5">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
            title="Filter by month & year"
            className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 outline-none focus:border-accent dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400 transition"
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 rounded-2xl bg-slate-100 p-5 dark:bg-white/6">
            <ShoppingBag size={32} className="text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-[14px] font-semibold text-slate-500">
            {hasActiveFilters ? "No tasks match your filters" : "No tasks found"}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            {hasActiveFilters ? "Try clearing the filters or searching something else" : "New tasks will appear here"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t) => {
              const currentStage = getStageFromTask(t);
              const isOnHold = t.status === "On Hold";
              const isComplete = t.status === "Complete";

              return (
                <button
                  key={t.id}
                  onClick={() => setOpenTask(t)}
                  className="group card flex flex-col gap-3 p-4 text-left transition hover:shadow-md hover:border-accent/30 dark:bg-[#1A1D27] dark:hover:border-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`badge capitalize ${
                      isComplete ? "badge-success"
                      : isOnHold ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "badge-accent"
                    }`}>
                      {t.status}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source={t.source} />
                      {t.source === "manual" && (
                        <button
                          onClick={(e) => handleDelete(e, t)}
                          title="Delete task"
                          className="rounded-md p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 dark:text-slate-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <ChevronRight size={15} className="text-slate-300 transition group-hover:text-accent dark:text-slate-600" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">{t.title}</p>
                    <p className="truncate text-[12px] font-medium text-slate-600 dark:text-slate-300">Client: {t.client_name || "—"}</p>
                    <p className="truncate text-[11.5px] text-slate-400">Staff: {t.assignee?.name || "—"}</p>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {currentStage}
                      </span>
                      <span className={`text-[11px] font-bold ${
                        isOnHold ? "text-amber-500" : isComplete ? "text-emerald-500" : "text-accent"
                      }`}>
                        {t.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          isOnHold ? "bg-amber-400" : isComplete ? "bg-emerald-500" : "bg-accent"
                        }`}
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Resizable slide-in drawer — shared with Staff's My Tasks, so
          mobile behavior (info screen first, then chat) is identical */}
      {openTask && (
        <TaskDrawer
          task={openTask}
          assigneeName={openTask.assignee?.name}
          staffToggleLabel="Staff"
          onClose={() => setOpenTask(null)}
          onProgressChange={handleProgressChange}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
        />
      )}
    </div>
  );
}
