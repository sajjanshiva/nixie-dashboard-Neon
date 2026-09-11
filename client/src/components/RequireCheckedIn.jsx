import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { getTodaySessions } from "../lib/api.js";

// Wraps every staff route EXCEPT Home. If the staff member hasn't got an
// open (checked-in, not yet checked-out) session today, they're bounced
// back to Home — that's the only screen reachable until they check in.
export default function RequireCheckedIn({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState("loading"); // loading | ok | blocked

  useEffect(() => {
    if (!user) return;
    getTodaySessions(user.id)
      .then((sessions) => {
        const last = sessions[sessions.length - 1];
        const isOpen = !!last && !last.check_out;
        setStatus(isOpen ? "ok" : "blocked");
      })
      .catch(() => setStatus("blocked"));
  }, [user]);

  if (status === "loading") {
    return (
      <div className="flex h-[50vh] items-center justify-center text-[13px] text-slate-400">
        Checking attendance…
      </div>
    );
  }
  if (status === "blocked") {
    return <Navigate to="/staff/home" replace state={{ needsCheckIn: true }} />;
  }
  return children;
}