import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getInviteInfo, acceptInvite } from "../lib/api.js";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getInviteInfo(token)
      .then(setInvite)
      .catch((e) => setLoadError(e.message));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please enter your name");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords don't match");

    setSaving(true);
    try {
      const data = await acceptInvite({ token, name: name.trim(), password });
      // Log the person straight in with the session we just got back,
      // rather than making them separately visit /login right after.
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#0B0D14]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1A1D27]">
        <h1 className="mb-1 text-[18px] font-bold text-slate-900 dark:text-white">Welcome to Nixie Dashboard</h1>
        <p className="mb-5 text-[12.5px] text-slate-400">
          Setting up your account as <span className="font-semibold capitalize">{invite.role}</span> — {invite.email}
        </p>
        <div className="space-y-3">
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
          <input placeholder="Password (min. 8 characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          <input placeholder="Confirm password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">
            {saving ? "Setting up…" : "Set password & continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
