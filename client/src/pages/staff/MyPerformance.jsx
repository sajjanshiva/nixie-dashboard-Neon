import React from "react";
import { useAuth } from "../../lib/AuthContext.jsx";
import PerformanceDetail from "../../components/PerformanceDetail.jsx";

export default function MyPerformance() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <PerformanceDetail
        staffId={user.id}
        staffName={user.name}
        staffRole="staff"
        isAdmin={false}
      />
    </div>
  );
}