const API_BASE = import.meta.env.VITE_API_BASE_URL;
const WS_BASE = API_BASE.replace(/^http/, "ws"); // http(s):// -> ws(s)://
const PING_INTERVAL_MS = 4 * 60 * 1000; // well under Render's 15-min idle window
const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_DELAY_MS = 2000;
const POLL_FALLBACK_INTERVAL_MS = 5000;

// Opens a WebSocket connection scoped to one task's chat. Calls
// onMessage(message) once for each new message that arrives. Returns an
// unsubscribe function that tears down whatever's currently active
// (socket or fallback poller) cleanly.
//
// Resilience, in order:
//  1. Normal case: WebSocket connects, stays open, instant delivery.
//  2. Temporary drop (WiFi blip, laptop sleep): auto-reconnects after a
//     short delay, up to MAX_RECONNECT_ATTEMPTS.
//  3. WebSocket fundamentally unreachable (e.g. a restrictive network
//     blocks the upgrade entirely) — after exhausting reconnect attempts,
//     falls back to plain polling instead of retrying forever and
//     leaving the chat silently stale.
export function subscribeToTaskChat(taskId, token, onMessage) {
  let ws;
  let pingTimer;
  let reconnectTimer;
  let pollTimer;
  let closedByCaller = false;
  let attempts = 0;
  const seenIds = new Set(); // avoids redundant re-delivery once in poll mode

  function startPolling() {
    async function poll() {
      try {
        const currentToken = localStorage.getItem("nixie_dashboard_token");
        const res = await fetch(`${API_BASE}/api/messages/${taskId}`, {
          headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        (Array.isArray(data) ? data : []).forEach((m) => {
          if (seenIds.has(m.id)) return;
          seenIds.add(m.id);
          onMessage(m);
        });
      } catch {
        // Network hiccup mid-poll — just try again next interval.
      }
    }
    poll();
    pollTimer = setInterval(poll, POLL_FALLBACK_INTERVAL_MS);
  }

  function connect() {
    ws = new WebSocket(`${WS_BASE}/ws/task-chat?token=${encodeURIComponent(token)}&taskId=${encodeURIComponent(taskId)}`);

    ws.onopen = () => {
      attempts = 0; // a real successful connection resets the retry count
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_messages") {
          data.messages.forEach((m) => {
            seenIds.add(m.id); // in case we later degrade to polling
            onMessage(m);
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      clearInterval(pingTimer);
      if (closedByCaller) return;

      attempts += 1;
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        startPolling();
        return;
      }
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }

  connect();

  return function unsubscribe() {
    closedByCaller = true;
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    ws?.close();
  };
}