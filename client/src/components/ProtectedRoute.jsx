import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";

// `role` prop is "admin" or "staff" — but with custom roles (e.g.
// "Designer") now stored as the literal value of user.role, "staff"
// here means "anyone who isn't admin", not an exact string match.
// Exact-matching "staff" was the actual cause of a real bug: a custom
// role hitting any /staff/* route would fail the check, get redirected
// to /staff/home — which is ALSO guarded the same way — and loop there
// forever. Checking isAdmin instead makes every non-admin role pass
// through staff routes correctly, with no possible loop.
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const isAdmin = user.role === "admin";
  if (role === "admin" && !isAdmin) {
    return <Navigate to="/staff/home" replace />;
  }
  if (role === "staff" && isAdmin) {
    return <Navigate to="/admin/all-tasks" replace />;
  }
  return children;
}