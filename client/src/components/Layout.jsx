import React, { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Sun, Moon, X, User } from "lucide-react";
import Avatar from "./Avatar.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { useAuth } from "../lib/AuthContext.jsx";
import { useTheme } from "../lib/ThemeContext.jsx";

function NixieLogo({ size = 28 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent shadow-sm"
    >
      <span style={{ fontSize: size * 0.42, lineHeight: 1 }} className="font-bold tracking-tight text-white select-none">
        N
      </span>
    </div>
  );
}

function ThemeToggle({ className = "" }) {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label={dark ? "Light mode" : "Dark mode"}
      className={`flex items-center justify-center rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/8 ${className}`}>
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

// ── Mobile profile dropdown (logout + theme toggle) ──────────────────
function MobileProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { dark, toggle } = useTheme();

  useEffect(() => {
    if (!open) return;
    function close(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-slate-100 dark:hover:bg-white/8"
        aria-label="Account menu"
      >
        <Avatar name={user?.name || "?"} className="h-7 w-7 text-[10px]" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 animate-fade-in overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-white/8 dark:bg-[#1A1D27]">
          {/* User info */}
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/6">
            <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white">{user?.name}</p>
            <p className="truncate text-[11px] capitalize text-slate-400">{user?.role}</p>
          </div>
          {/* Dark mode toggle */}
          <button
            onClick={() => { toggle(); setOpen(false); }}
            className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
          {/* Logout */}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-[13px] font-semibold text-danger transition hover:bg-danger/5 dark:border-white/6"
          >
            <LogOut size={15} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ navItems, title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#0F1117]">

      {/* ── Desktop sidebar ──────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col md:flex relative">
        <div className="absolute inset-0 border-r border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-white/6 dark:bg-[#13151F]/90" />
        <div className="relative flex flex-1 flex-col">
          {/* Brand */}
          <div className="flex items-center gap-2.5 px-5 py-5">
            <NixieLogo size={30} />
            <div>
              <span className="block text-[14px] font-bold leading-tight text-slate-900 dark:text-white">Nixie</span>
              <span className="block text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Dashboard</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex flex-1 flex-col gap-0.5 px-3">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : "nav-item-inactive"}`}>
                <span className="flex items-center gap-2.5">
                  <item.icon size={16} />{item.label}
                </span>
                {item.badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User row */}
          <div className="border-t border-slate-100 px-3 py-3 dark:border-white/6">
            <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition">
              <Avatar name={user?.name || "?"} className="h-8 w-8 text-[11px] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
                <p className="text-[10.5px] capitalize text-slate-400 dark:text-slate-500">{user?.role}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-danger transition" aria-label="Log out">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-white/6 dark:bg-[#13151F]/80 md:px-6">
          <div className="flex items-center gap-2.5 md:gap-0">
            <div className="md:hidden"><NixieLogo size={26} /></div>
            <h1 className="ml-2 text-[15px] font-bold text-slate-900 dark:text-white md:ml-0 md:text-[16px]">{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            {/* Desktop: theme toggle visible in header */}
            <ThemeToggle className="hidden md:flex" />
            <NotificationBell />
            {/* Mobile: profile avatar (has logout + theme toggle inside) */}
            <div className="md:hidden">
              <MobileProfileMenu user={user} onLogout={handleLogout} />
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="min-h-0 flex-1 overflow-y-auto pb-[68px] md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav — ALL items always visible ─────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/6 dark:bg-[#13151F]/95 md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center py-2 transition ${isActive ? "text-accent" : "text-slate-400 dark:text-slate-500"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex items-center justify-center rounded-xl p-1.5 transition ${isActive ? "bg-accent/10" : ""}`}>
                  <item.icon size={navItems.length > 5 ? 18 : 20} />
                </span>
                <span className={`leading-none ${navItems.length > 5 ? "text-[9px]" : "text-[10px]"} font-medium mt-0.5`}>
                  {/* Shorten long labels on mobile when 6 items */}
                  {navItems.length > 5
                    ? item.label.replace("Reimbursements", "Reimburse").replace("Performance", "Perform")
                    : item.label}
                </span>
                {item.badge > 0 && (
                  <span className="absolute right-[15%] top-1 h-2 w-2 rounded-full bg-danger" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
