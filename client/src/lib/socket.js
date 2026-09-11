const API_BASE = import.meta.env.VITE_API_BASE_URL;
const WS_BASE = API_BASE.replace(/^http/, "ws"); // http(s):// -> ws(s)://
const PING_INTERVAL_MS = 4 * 60 * 1000; // well under Render's 15-min idle window

// Opens a WebSocket connection scoped to one task's chat. Calls
// onMessage(message) once for each new message that arrives — same
// single-message callback shape TaskConversation.jsx already used with
// the old Supabase Realtime subscription, so it's a drop-in swap.
// Returns an unsubscribe function that closes the connection cleanly.
export function subscribeToTaskChat(taskId, token, onMessage) {
  let ws;
  let pingTimer;
  let reconnectTimer;
  let closedByCaller = false;

  function connect() {
    ws = new WebSocket(`${WS_BASE}/ws/task-chat?token=${encodeURIComponent(token)}&taskId=${encodeURIComponent(taskId)}`);

    ws.onopen = () => {
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_messages") {
          data.messages.forEach((m) => onMessage(m));
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      clearInterval(pingTimer);
      if (closedByCaller) return;
      // Connection dropped unexpectedly (network blip, laptop sleep,
      // etc.) — quietly reconnect after a short delay instead of
      // leaving the chat stuck stale until a manual refresh.
      reconnectTimer = setTimeout(connect, 2000);
    };
  }

  connect();

  return function unsubscribe() {
    closedByCaller = true;
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    ws?.close();
  };
}
