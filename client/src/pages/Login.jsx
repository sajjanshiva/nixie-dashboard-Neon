import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/AuthContext.jsx";

// Round logo mark matching the Nixie brand — teal circle with "N"
function NixieLogoMark({ size = 56 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-accent shadow-lg"
    >
      <span
        style={{ fontSize: size * 0.4, lineHeight: 1 }}
        className="select-none font-bold tracking-tight text-white"
      >
        N
      </span>
    </div>
  );
}

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (user) navigate(user.role === "admin" ? "/admin/all-tasks" : "/staff/home", { replace: true });
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await login(email, password);
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* ── Left panel (brand / hero) — desktop only ── */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[52%] xl:w-[55%]">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F1117] via-[#141820] to-[#1a1d2e]" />

        {/* Subtle teal glow blobs */}
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent/10 blur-[100px]" />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between p-12">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <NixieLogoMark size={38} />
            <div>
              <span className="block text-[17px] font-bold leading-tight text-white">
                Nixie
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/80">
                Dashboard
              </span>
            </div>
          </div>

          {/* Hero text */}
          <div>
            <h1 className="mb-4 text-[42px] font-extrabold leading-[1.1] text-white xl:text-[48px]">
              Your team,
              <br />
              <span className="text-accent">beautifully</span>
              <br />
              managed.
            </h1>
            <p className="max-w-sm text-[15px] leading-relaxed text-slate-400">
              Attendance, tasks, leads, and performance — everything in one
              place for your team and clients.
            </p>
          </div>

          {/* Footer note */}
          <p className="text-[12px] text-slate-600">
            © {new Date().getFullYear()} Nixie. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right panel (login form) ── */}
      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12 dark:bg-[#0F1117]">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only brand */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <NixieLogoMark size={52} />
            <div className="text-center">
              <p className="text-[20px] font-extrabold text-slate-900 dark:text-white">
                Nixie Dashboard
              </p>
              <p className="text-[13px] text-slate-400">Sign in to continue</p>
            </div>
          </div>

          {/* Desktop heading */}
          <div className="mb-8 hidden lg:block">
            <h2 className="text-[26px] font-extrabold text-slate-900 dark:text-white">
              Welcome back 👋
            </h2>
            <p className="mt-1 text-[14px] text-slate-400">
              Sign in to your Nixie account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600 dark:text-slate-400">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600 dark:text-slate-400">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
                <p className="text-[12.5px] text-danger-text">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-[14.5px]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] text-slate-400">
            Accounts are created by an Admin — there's no self-registration.
          </p>
        </div>
      </div>
    </div>
  );
}
