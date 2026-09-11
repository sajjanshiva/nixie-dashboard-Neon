import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LayoutGrid, ShoppingBag, ClipboardCheck, Users, BarChart3, Home as HomeIcon, ListChecks, Plane, Receipt, Target, Settings as SettingsIcon, CalendarDays } from "lucide-react";

import { useAuth } from "./lib/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RequireCheckedIn from "./components/RequireCheckedIn.jsx";
import Layout from "./components/Layout.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import Login from "./pages/Login.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import AllTasks from "./pages/admin/AllTasks.jsx";
import ShopifyInbox from "./pages/admin/ShopifyInbox.jsx";
import Approvals from "./pages/admin/Approvals.jsx";
import Team from "./pages/admin/Team.jsx";
import AdminPerformance from "./pages/admin/Performance.jsx";
import AdminSettings from "./pages/admin/Settings.jsx";
import AdminHolidays from "./pages/admin/Holidays.jsx";

import StaffHome from "./pages/staff/Home.jsx";
import MyTasks from "./pages/staff/MyTasks.jsx";
import MyLeads from "./pages/staff/MyLeads.jsx";
import Leave from "./pages/staff/Leave.jsx";
import Reimbursements from "./pages/staff/Reimbursements.jsx";
import MyPerformance from "./pages/staff/MyPerformance.jsx";

const ADMIN_NAV = [
  { to: "/admin/all-tasks", label: "All Tasks", icon: LayoutGrid },
  { to: "/admin/shopify-inbox", label: "Shopify Inbox", icon: ShoppingBag },
  { to: "/admin/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/admin/team", label: "Team", icon: Users },
  { to: "/admin/performance", label: "Performance", icon: BarChart3 },
  { to: "/admin/holidays", label: "Holidays", icon: CalendarDays },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

const STAFF_NAV = [
  { to: "/staff/home", label: "Home", icon: HomeIcon },
  { to: "/staff/my-tasks", label: "My Tasks", icon: ListChecks },
  { to: "/staff/my-leads", label: "My Leads", icon: Target },
  { to: "/staff/leave", label: "Leave", icon: Plane },
  { to: "/staff/reimbursements", label: "Reimbursements", icon: Receipt },
  { to: "/staff/performance", label: "Performance", icon: BarChart3 },
];

function AdminShell({ title, children }) {
  return <Layout navItems={ADMIN_NAV} title={title}>{children}</Layout>;
}
function StaffShell({ title, children }) {
  return <Layout navItems={STAFF_NAV} title={title}>{children}</Layout>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />

        <Route path="/admin/all-tasks" element={<ProtectedRoute role="admin"><AdminShell title="All Tasks"><AllTasks /></AdminShell></ProtectedRoute>} />
        <Route path="/admin/shopify-inbox" element={<ProtectedRoute role="admin"><AdminShell title="Shopify Inbox"><ShopifyInbox /></AdminShell></ProtectedRoute>} />
        <Route path="/admin/approvals" element={<ProtectedRoute role="admin"><AdminShell title="Approvals"><Approvals /></AdminShell></ProtectedRoute>} />
        <Route path="/admin/team" element={<ProtectedRoute role="admin"><AdminShell title="Team"><Team /></AdminShell></ProtectedRoute>} />
        <Route path="/admin/performance" element={<ProtectedRoute role="admin"><AdminShell title="Performance"><AdminPerformance /></AdminShell></ProtectedRoute>} />
        <Route path="/admin/holidays" element={<ProtectedRoute role="admin"><AdminShell title="Holidays"><AdminHolidays /></AdminShell></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute role="admin"><AdminShell title="Settings"><AdminSettings /></AdminShell></ProtectedRoute>} />

        {/* Home is always reachable once logged in — it's the only place staff can check in/out */}
        <Route path="/staff/home" element={<ProtectedRoute role="staff"><StaffShell title="Home"><StaffHome /></StaffShell></ProtectedRoute>} />

        {/* Everything else requires an open (checked-in) session today */}
        <Route path="/staff/my-tasks" element={<ProtectedRoute role="staff"><StaffShell title="My Tasks"><RequireCheckedIn><MyTasks /></RequireCheckedIn></StaffShell></ProtectedRoute>} />
        <Route path="/staff/my-leads" element={<ProtectedRoute role="staff"><StaffShell title="My Leads"><RequireCheckedIn><MyLeads /></RequireCheckedIn></StaffShell></ProtectedRoute>} />
        <Route path="/staff/leave" element={<ProtectedRoute role="staff"><StaffShell title="Leave"><RequireCheckedIn><Leave /></RequireCheckedIn></StaffShell></ProtectedRoute>} />
        <Route path="/staff/reimbursements" element={<ProtectedRoute role="staff"><StaffShell title="Reimbursements"><RequireCheckedIn><Reimbursements /></RequireCheckedIn></StaffShell></ProtectedRoute>} />
        <Route path="/staff/performance" element={<ProtectedRoute role="staff"><StaffShell title="My Performance"><RequireCheckedIn><MyPerformance /></RequireCheckedIn></StaffShell></ProtectedRoute>} />

        <Route
          path="*"
          element={<Navigate to={user ? (user.role === "admin" ? "/admin/all-tasks" : "/staff/home") : "/login"} replace />}
        />
      </Routes>
    </ErrorBoundary>
  );
}