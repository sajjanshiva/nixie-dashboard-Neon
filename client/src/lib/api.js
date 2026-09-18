// Central data layer. Most reads/writes go straight to Supabase (secured by
// the RLS policies in supabase/schema.sql). Anything that needs a secret key
// — sending a WhatsApp message, validating a GPS check-in against the office
// geofence — is routed through the Express backend (stage 2) instead, so
// those secrets never sit in the browser.

import { subscribeToTaskChat } from "./socket.js";
import { istDateStr } from "./istDate.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function readBody(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function apiPost(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await readBody(res);
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

async function apiGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await readBody(res);
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

async function apiPatch(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await readBody(res);
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

async function apiPut(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await readBody(res);
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

async function apiDelete(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await readBody(res);
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

// Reads the session token our own AuthContext saves to localStorage.
// Previously this called supabase.auth.getSession() — now that login is
// our own JWT (not a Supabase session), every function in this file that
// calls authToken() (basically all of them) needed this one fixed for
// anything to keep working at all.
async function authToken() {
  return localStorage.getItem("nixie_dashboard_token");
}

// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------

export async function getTasks({ assigneeId, status, unassigned, page, pageSize } = {}) {
  const token = await authToken();
  const params = new URLSearchParams();
  if (assigneeId) params.set("assigneeId", assigneeId);
  if (status) params.set("status", status);
  if (unassigned) params.set("unassigned", "true");
  if (page) params.set("page", page);
  if (pageSize) params.set("pageSize", pageSize);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/tasks${qs}`, token); // { tasks, total, page, pageSize, totalPages }
}

export async function getTask(taskId) {
  const token = await authToken();
  return apiGet(`/api/tasks/${taskId}`, token);
}

export async function createTask(task) {
  const token = await authToken();
  return apiPost("/api/tasks", task, token);
}

export async function assignTask(taskId, assigneeId) {
  const token = await authToken();
  return apiPut(`/api/tasks/${taskId}/assign`, { assigneeId }, token);
}

export async function updateTaskProgress(taskId, progress) {
  // Routed through the backend so the "client gets a WhatsApp update
  // automatically" step can fire from one place.
  const token = await authToken();
  return apiPost("/api/tasks/progress", { taskId, progress }, token);
}

export async function markTaskComplete(taskId) {
  const token = await authToken();
  return apiPost(`/api/tasks/${taskId}/complete`, {}, token);
}

// Manual tasks only — enforced server-side too, this isn't just a UI restriction.
export async function deleteTask(taskId) {
  const token = await authToken();
  return apiDelete(`/api/tasks/${taskId}`, token);
}

// Reverts a task from Complete back to In Progress without touching its
// progress value — for undoing an accidental Mark Complete click. Routed
// through the backend (not a direct Supabase update, unlike markTaskComplete)
// so the task-reopened system message is logged from one place.
export async function undoTaskComplete(taskId) {
  const token = await authToken();
  return apiPost("/api/tasks/undo-complete", { taskId }, token);
}

// ---------------------------------------------------------------------
// Shopify inbox (orders + leads) — populated by the backend webhooks
// ---------------------------------------------------------------------

// Joins the linked task (if this order has already been assigned/converted)
// so the Orders tab can show who it's assigned to without a second query.
// Paginated (page/pageSize) — returns { orders, total, page, pageSize,
// totalPages } instead of a plain array.
export async function getShopifyOrders({ page, pageSize } = {}) {
  const token = await authToken();
  const params = new URLSearchParams();
  if (page) params.set("page", page);
  if (pageSize) params.set("pageSize", pageSize);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/shopify-inbox/orders${qs}`, token);
}

export async function updateOrderStatus(orderId, status) {
  const token = await authToken();
  return apiPatch(`/api/shopify-inbox/orders/${orderId}/status`, { status }, token);
}

// Converts a Shopify order into a real task, assigns it to a staff
// member, and links the order row to the new task. Now enforced entirely
// server-side (see routes/shopifyInbox.js) instead of two direct
// Supabase writes from the browser.
export async function assignOrder(order, { phone, assigneeId }) {
  const token = await authToken();
  return apiPost(`/api/shopify-inbox/orders/${order.id}/assign`, { phone, assigneeId }, token);
}

// Paginated (page/pageSize) — returns { leads, total, page, pageSize,
// totalPages } instead of a plain array.
export async function getShopifyLeads({ assigneeId, page, pageSize } = {}) {
  // Note: assigneeId param is now vestigial for staff (server always
  // scopes to req.user for non-admins) but harmless to keep passing.
  const token = await authToken();
  const params = new URLSearchParams();
  if (page) params.set("page", page);
  if (pageSize) params.set("pageSize", pageSize);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/shopify-inbox/leads${qs}`, token);
}

export async function markLeadContacted(leadId) {
  const token = await authToken();
  return apiPost(`/api/shopify-inbox/leads/${leadId}/contacted`, {}, token);
}

export async function assignLead(leadId, assigneeId) {
  const token = await authToken();
  return apiPost(`/api/shopify-inbox/leads/${leadId}/assign`, { assigneeId }, token);
}

export async function syncShopifyInbox() {
  const token = await authToken();
  return apiPost("/api/shopify-inbox/sync", {}, token);
}

// ---------------------------------------------------------------------
// Messages (task conversation)
// ---------------------------------------------------------------------

// Chat-style "load earlier" pagination. No options -> latest 40 (oldest
// first, ready to render). Pass { before: <messageId> } to get the 24
// messages just before that one (for scrolling up into history). Returns
// { messages, hasMore } instead of a plain array.
export async function getMessages(taskId, { before, limit } = {}) {
  const token = await authToken();
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (limit) params.set("limit", limit);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/messages/${taskId}${qs}`, token);
}

// Returns a WebSocket-based subscription instead of the old Supabase
// Realtime channel — see lib/socket.js. Kept async since callers awaited
// authToken() as part of setting this up (needed to pass the token to
// the socket for auth, same as any other authenticated request).
// Returns the unsub function directly (synchronous), NOT a promise —
// this matters. It only needs the token from localStorage, which is
// actually synchronous; making this async (awaiting it before opening
// the socket) created a timing gap where React StrictMode's dev-mode
// mount->cleanup->mount cycle could race against the socket still
// connecting, closing it mid-handshake ("WebSocket is closed before the
// connection is established"). Opening synchronously, inside the same
// tick as the effect, avoids the race entirely.
export function subscribeToMessages(taskId, onInsert) {
  const token = localStorage.getItem("nixie_dashboard_token");
  return subscribeToTaskChat(taskId, token, onInsert);
}

// toStaff / toClient are the two composer toggles. Routed through the
// backend because toClient triggers a real WhatsApp API call.
export async function sendMessage({ taskId, text, toStaff, toClient }) {
  const token = await authToken();
  return apiPost("/api/messages/send", { taskId, text, toStaff, toClient }, token);
}

// ---------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------

// Pagination is OPT-IN: pass { status, page, pageSize } to get the new
// paginated shape { leaves, total, page, pageSize, totalPages } (used by
// the admin Approvals page). Called with nothing (or just { staffId },
// which the server ignores and scopes by the logged-in user instead) ->
// old plain-array behavior, unchanged for the staff-side Leave.jsx page.
export async function getLeaves({ staffId, status, page, pageSize } = {}) {
  const token = await authToken();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page) params.set("page", page);
  if (pageSize) params.set("pageSize", pageSize);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/leaves${qs}`, token);
}

export async function submitLeave(leave) {
  const token = await authToken();
  return apiPost("/api/leaves", leave, token);
}

export async function decideLeave(leaveId, status, rejectReason = null) {
  const token = await authToken();
  return apiPatch(`/api/leaves/${leaveId}/decide`, { status, rejectReason }, token);
}

// ---------------------------------------------------------------------
// Reimbursements
// ---------------------------------------------------------------------

// Same opt-in pagination pattern as getLeaves above.
export async function getReimbursements({ staffId, status, page, pageSize } = {}) {
  const token = await authToken();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page) params.set("page", page);
  if (pageSize) params.set("pageSize", pageSize);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/reimbursements${qs}`, token);
}

export async function submitReimbursement(reimbursement) {
  const token = await authToken();
  return apiPost("/api/reimbursements", reimbursement, token);
}

export async function decideReimbursement(id, status, rejectReason = null) {
  const token = await authToken();
  return apiPatch(`/api/reimbursements/${id}/decide`, { status, rejectReason }, token);
}

// ---------------------------------------------------------------------
// ImageKit (receipt uploads) — client asks the backend for a signature,
// then uploads directly to ImageKit so the private key never touches
// the browser.
// ---------------------------------------------------------------------

export async function getImageKitAuthParams() {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/imagekit-auth`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Could not get ImageKit upload signature");
  return res.json(); // { signature, token, expire }
}

// ---------------------------------------------------------------------
// Attendance — check-in/out validated server-side (GPS + office geofence).
// Staff can check in/out multiple times a day (sessions); a checkout at
// or after office end time locks further check-ins until the next day.
// ---------------------------------------------------------------------

export async function checkIn({ lat, lng, workMode }) {
  const token = await authToken();
  return apiPost("/api/attendance/check-in", { lat, lng, workMode }, token);
}

export async function checkOut() {
  const token = await authToken();
  return apiPost("/api/attendance/check-out", {}, token);
}

// Closes any session left open from a previous day (forgotten checkout).
// Call this once when the Home page loads, before reading today/week data.
export async function syncAttendance() {
  const token = await authToken();
  return apiPost("/api/attendance/sync", {}, token);
}

export async function getAttendanceSummary({ staffId } = {}) {
  const token = await authToken();
  const qs = staffId ? `?staffId=${encodeURIComponent(staffId)}` : "";
  return apiGet(`/api/attendance/summary${qs}`, token);
}

// All of today's sessions for a staff member, oldest first. Empty array
// if they haven't checked in at all today.
export async function getTodaySessions(staffId) {
  const token = await authToken();
  return apiGet("/api/attendance/today", token);
}

// Fetch this week's attendance, grouped by date (each date can have
// multiple sessions now). Used by the Home page week strip.
export async function getWeekAttendance(staffId) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const from = istDateStr(monday);
  const to   = istDateStr(sunday);

  const token = await authToken();
  const data = await apiGet("/api/attendance/week", token);

  // Group sessions by date: { "YYYY-MM-DD": { sessions: [...], status, overtimeMinutes } }
  const map = {};
  (data || []).forEach((r) => {
    if (!map[r.date]) map[r.date] = { sessions: [], status: null, overtimeMinutes: 0 };
    map[r.date].sessions.push(r);
    if (r.status) map[r.date].status = r.status;
    map[r.date].overtimeMinutes += r.overtime_minutes || 0;
  });
  return { map, from, to, monday };
}

// Admin: full session log for one staff member over a date range.
export async function getAttendanceDetail(staffId, from, to) {
  const token = await authToken();
  const res = await fetch(
    `${API_BASE}/api/attendance/detail?staffId=${staffId}&from=${from}&to=${to}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error("Failed to load attendance detail");
  return res.json();
}

// Admin: correct a session's checkout time (e.g. an auto-closed,
// forgotten-checkout session — staff tells admin when they really left).
export async function correctAttendanceSession(sessionId, checkOutIso) {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/attendance/${sessionId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ checkOut: checkOutIso }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Failed to update session"); }
  return res.json();
}

// ---------------------------------------------------------------------
// Performance — holiday/leave/overtime-aware stats, computed server-side
// ---------------------------------------------------------------------

export async function getPerformance(staffId, from, to) {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/performance/staff/${staffId}?from=${from}&to=${to}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load performance data");
  return res.json();
}

// Admin only — all staff at once, for the summary table.
export async function getPerformanceSummary(from, to) {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/performance/summary?from=${from}&to=${to}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load performance summary");
  return res.json();
}

// ---------------------------------------------------------------------
// Settings — office start/end time + geofence (admin-editable)
// ---------------------------------------------------------------------

export async function getSettings() {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/settings`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json(); // { officeStartTime, officeEndTime, officeLocation }
}

export async function updateSettings(payload) {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Failed to update settings"); }
  return res.json();
}

// ---------------------------------------------------------------------
// Holidays — national (auto-fetched) + custom, editable by admin
// ---------------------------------------------------------------------

export async function getHolidays(year) {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/holidays?year=${year}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load holidays");
  return res.json();
}

export async function addOrEditHoliday(date, name) {
  const token = await authToken();
  return apiPost("/api/holidays", { date, name }, token);
}

export async function deleteHoliday(date) {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/holidays/${date}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to delete holiday");
  return res.json();
}

export async function seedNationalHolidays(year, country = "IN") {
  const token = await authToken();
  const res = await fetch(`${API_BASE}/api/holidays/seed?year=${year}&country=${country}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch national holidays");
  return res.json();
}

// ---------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------

// Returns both pending invites and active members, each flagged with
// `pending: true/false` — the Team page splits them into two groups.
export async function getTeamMembers() {
  const token = await authToken();
  return apiGet("/api/team", token);
}

// Replaces addTeamMember: admin no longer sets a name or password
// directly — just email + role. The invited person sets their own name
// and password via an emailed link (see AcceptInvite.jsx).
export async function inviteTeamMember({ email, role }) {
  const token = await authToken();
  return apiPost("/api/team/invite", { email, role }, token);
}

// Cancels a pending (not-yet-accepted) invite. Re-inviting the same
// email afterward effectively resends it.
export async function cancelInvite(profileId) {
  const token = await authToken();
  return apiDelete(`/api/team/invite/${profileId}`, token);
}

// Public — no auth token, since the person accepting an invite isn't
// logged in yet. Used by AcceptInvite.jsx.
export async function getInviteInfo(inviteToken) {
  return apiGet(`/api/auth/invite/${inviteToken}`);
}

export async function acceptInvite({ token, name, password }) {
  return apiPost("/api/auth/accept-invite", { token, name, password });
}

// ── Forgot / reset password (public — no auth token) ──
export async function forgotPassword(email) {
  return apiPost("/api/auth/forgot-password", { email });
}

export async function getResetPasswordInfo(token) {
  return apiGet(`/api/auth/reset-password/${token}`);
}

export async function resetPassword({ token, password }) {
  return apiPost("/api/auth/reset-password", { token, password });
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

// Polled by NotificationBell.jsx every ~20s (replaces the old Supabase
// Realtime channel — Neon has no equivalent, and for the bell, a short
// poll delay is a fine tradeoff, unlike chat where it'd be noticeable).
// Always just the 5 most recent — the dropdown preview.
export async function getNotifications() {
  const token = await authToken();
  return apiGet("/api/notifications", token);
}

// Full paginated history, for the "View all" page. Returns
// { notifications, total, page, pageSize, totalPages }.
export async function getAllNotifications({ page, pageSize } = {}) {
  const token = await authToken();
  const params = new URLSearchParams();
  if (page) params.set("page", page);
  if (pageSize) params.set("pageSize", pageSize);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/notifications/all${qs}`, token);
}

export async function markAllNotificationsRead() {
  const token = await authToken();
  return apiPost("/api/notifications/mark-read", {}, token);
}