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
// callers should catch and show a toast.
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

  return subscription;
}