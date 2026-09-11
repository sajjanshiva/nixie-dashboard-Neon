import React, { createContext, useContext, useEffect, useState } from "react";

// Our own JWT-based auth — no self-registration anywhere in the UI.
// Accounts are created by an Admin inviting someone (Team page) or
// seeded via the backend on first boot. Role is read from the profiles
// table, never chosen on the frontend. Previously this wrapped Supabase
// Auth (supabase.auth.signInWithPassword, onAuthStateChange, etc.); now
// the session is just our own JWT stored in localStorage, and every
// sensitive read/write is enforced server-side in Express route
// handlers instead of Supabase RLS policies.
const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL;
const TOKEN_KEY = "nixie_dashboard_token";

async function apiPost(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function apiGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // On load, if a token is already saved, re-fetch the profile fresh
  // rather than trusting anything cached — also doubles as a validity
  // check (an expired/invalid token gets logged out automatically).
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    apiGet("/api/auth/me", token)
      .then((data) => setProfile(data.profile))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(email, password) {
    try {
      const data = await apiPost("/api/auth/login", { email, password });
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setProfile(data.profile);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session: token ? { access_token: token } : null, // shape kept similar for anything still reading session.access_token
        user: profile, // { id, name, email, role }
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
