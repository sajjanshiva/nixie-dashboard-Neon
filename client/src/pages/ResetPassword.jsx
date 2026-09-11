import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getResetPasswordInfo, resetPassword } from "../lib/api.js";
import SetPasswordForm from "../components/SetPasswordForm.jsx";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getResetPasswordInfo(token)
      .then(setInfo)
      .catch((e) => setLoadError(e.message));
  }, [token]);

  async function handleSubmit({ password }) {
    setError("");
    setSaving(true);
    try {
      const data = await resetPassword({ token, password });
      localStorage.setItem("nixie_dashboard_token", data.token);
      navigate(data.profile.role === "admin" ? "/admin/all-tasks" : "/staff/home");
      window.location.reload();
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
          <Link to="/forgot-password" className="mt-3 inline-block text-[12.5px] font-medium text-accent hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B0D14]">
        <p className="text-[13px] text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <SetPasswordForm
      mode="reset"
      email={info.email}
      onSubmit={handleSubmit}
      submitting={saving}
      error={error}
    />
  );
}