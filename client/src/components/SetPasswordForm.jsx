import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import NixieLogo from "./NixieLogo.jsx";

// mode: "invite" (shows Name field, subtitle mentions role) | "reset" (no
// Name field, subtitle is just "reset your password")
export default function SetPasswordForm({ mode, email, role, onSubmit, submitting, error, submitLabel }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [localError, setLocalError] = useState("");

  const isInvite = mode === "invite";

  function submit(e) {
    e.preventDefault();
    setLocalError("");
    if (isInvite && !name.trim()) return setLocalError("Please enter your name");
    if (password.length < 8) return setLocalError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setLocalError("Passwords don't match");
    onSubmit({ name: name.trim(), password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 dark:bg-[#0B0D14]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1A1D27] sm:p-7">
        {/* Branding — matches the sidebar exactly */}
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <NixieLogo size={40} />
          <div>
            <span className="block text-[16px] font-bold leading-tight text-slate-900 dark:text-white">Nixie</span>
            <span className="block text-[10.5px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Dashboard</span>
          </div>
        </div>

        <h1 className="mb-1 text-center text-[16px] font-bold text-slate-900 dark:text-white">
          {isInvite ? "Set up your account" : "Reset your password"}
        </h1>
        <p className="mb-6 text-center text-[12.5px] text-slate-400">
          {isInvite ? (
            <>Joining as <span className="font-semibold capitalize text-slate-600 dark:text-slate-300">{role}</span> — {email}</>
          ) : (
            <>For <span className="font-semibold text-slate-600 dark:text-slate-300">{email}</span></>
          )}
        </p>

        <div className="space-y-3">
          {isInvite && (
            <input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              autoFocus
            />
          )}

          <div className="relative">
            <input
              placeholder="Password (min. 8 characters)"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-10"
              autoFocus={!isInvite}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="relative">
            <input
              placeholder="Confirm password"
              type={showConfirmPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={showConfirmPw ? "Hide password" : "Show password"}
            >
              {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {(localError || error) && <p className="text-[12px] text-rose-600">{localError || error}</p>}

          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {submitting ? "Please wait…" : (submitLabel || (isInvite ? "Set password & continue" : "Reset password"))}
          </button>
        </div>
      </form>
    </div>
  );
}