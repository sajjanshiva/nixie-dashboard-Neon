import React, { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../lib/api.js";
import NixieLogo from "../components/NixieLogo.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Please enter your email");
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true); // shown regardless of whether the account exists
    } catch (e) {
      setError(e.message || "Something went wrong — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 dark:bg-[#0B0D14]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1A1D27] sm:p-7">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <NixieLogo size={40} />
          <div>
            <span className="block text-[16px] font-bold leading-tight text-slate-900 dark:text-white">Nixie</span>
            <span className="block text-[10.5px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Dashboard</span>
          </div>
        </div>

        {sent ? (
          <div className="text-center">
            <h1 className="mb-2 text-[16px] font-bold text-slate-900 dark:text-white">Check your email</h1>
            <p className="text-[12.5px] text-slate-400">
              If an account exists for <span className="font-semibold text-slate-600 dark:text-slate-300">{email}</span>, a reset link has been sent. It's valid for 1 hour.
            </p>
            <Link to="/login" className="mt-5 inline-block text-[12.5px] font-medium text-accent hover:underline">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h1 className="mb-1 text-center text-[16px] font-bold text-slate-900 dark:text-white">Forgot your password?</h1>
            <p className="mb-6 text-center text-[12.5px] text-slate-400">Enter your email and we'll send you a reset link.</p>
            <div className="space-y-3">
              <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoFocus
              />
              {error && <p className="text-[12px] text-rose-600">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <Link to="/login" className="block text-center text-[12.5px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                Back to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}