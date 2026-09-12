// Web Push helpers — registering the service worker, requesting
// permission, and subscribing this device.

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function saveSubscriptionToServer(subscription) {
  const token = localStorage.getItem("nixie_dashboard_token");
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) throw new Error("Failed to save push subscription on the server");
}

// Call once on app load (see main.jsx). Safe to call even if the browser
// doesn't support service workers — it just no-ops.
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("Service worker registration failed:", err);
    return null;
  }
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// "default" (not yet asked) | "granted" | "denied" | "unsupported"
export function getPushPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// Requests permission, subscribes this device, and saves the subscription
// to the server. Throws if permission is denied or push isn't supported —
// callers should catch and show a toast. This is the ONLY path that ever
// requests permission — it's what the bell's "Enable notifications"
// button calls, and it's the one moment (per device, ever) that requires
// an actual click, since browsers require a real user gesture the first
// time a site asks.
export async function enablePush() {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported on this browser/device");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await saveSubscriptionToServer(subscription);
  return subscription;
}

// Silent self-heal — call once on every app load, for any already-
// logged-in user. Replaces the old approach of trusting a permanent
// localStorage flag ("nixie_dashboard_push_confirmed") that never got
// rechecked against reality: that flag could keep saying "all good"
// forever even after the underlying subscription quietly went bad (a
// browser-side reset, or the server cleaning up a dead subscription
// after a failed push — see lib/webpush.js on the server).
//
// Does NOT request permission and does NOT show anything to the user —
// if permission hasn't been granted yet ("default") or was explicitly
// blocked ("denied"), this just returns immediately; the bell's own
// button/message handles those two cases, since only a real user click
// can grant permission in the first place.
//
// When permission IS already granted, this always re-confirms with the
// server, every single time it runs — not only when the browser-side
// subscription looks missing. That's the part that makes it fully
// self-healing in both directions: it recreates the subscription if the
// browser lost it, AND re-saves it if the server's copy was deleted
// while the browser's copy still looked fine.
export async function ensurePushSubscribed() {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscriptionToServer(subscription);
  } catch (err) {
    // Best-effort background task, not a user-facing action — silent
    // failure here just means it tries again on the next app load.
    console.warn("Silent push resync failed:", err.message);
  }
}