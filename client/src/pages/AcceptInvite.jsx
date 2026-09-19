import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getInviteInfo, acceptInvite } from "../lib/api.js";
import SetPasswordForm from "../components/SetPasswordForm.jsx";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getInviteInfo(token)
      .then(setInvite)
      .catch((e) => setLoadError(e.message));
  }, [token]);

  async function handleSubmit({ name, password }) {
    setError("");
    setSaving(true);
    try {
      const data = await acceptInvite({ token, name, password });
      localStorage.setItem("nixie_dashboard_token", data.token);
      navigate(data.profile.role === "admin" ? "/admin/all-tasks" : "/staff/home");
      window.location.reload(); // ensures AuthContext picks up the new token cleanly
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#0B0D14]">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-[#1A1D27]">
          <p className="text-[14px] font-semibold text-rose-600">{loadError}</p>
          <p className="mt-2 text-[12.5px] text-slate-400">Ask an admin to remove and re-add you to get a fresh invite.</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B0D14]">
        <p className="text-[13px] text-slate-400">Loading invite…</p>
      </div>
    );
  }

  return (
    <SetPasswordForm
      mode="invite"
      email={invite.email}
      role={invite.role}
      title={invite.title}
      onSubmit={handleSubmit}
      submitting={saving}
      error={error}
    />
  );
}