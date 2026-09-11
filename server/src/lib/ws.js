import { WebSocketServer } from "ws";
import { pool } from "./db.js";
import { verifySessionToken } from "./auth.js";

// taskId -> Set of open WebSocket connections currently viewing that
// task's chat. A connection is added when someone opens a task's chat
// window and removed when they close it / disconnect.
const taskConnections = new Map();

function addConnection(taskId, ws) {
  if (!taskConnections.has(taskId)) taskConnections.set(taskId, new Set());
  taskConnections.get(taskId).add(ws);
}

function removeConnection(taskId, ws) {
  const set = taskConnections.get(taskId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) taskConnections.delete(taskId);
}

// Called by routes/messages.js right after a message is saved — pushes
// it instantly to anyone else currently looking at that task's chat.
export function broadcastNewMessages(taskId, messages) {
  const set = taskConnections.get(taskId);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify({ type: "new_messages", messages });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    // Only handle upgrade requests for our chat path — anything else
    // (there isn't anything else yet, but future-proofing) gets ignored.
    if (!req.url.startsWith("/ws/task-chat")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws, req) => {
    // Auth + the task itself are passed as query params, since a
    // WebSocket handshake can't carry a normal Authorization header the
    // way REST calls do: /ws/task-chat?token=<jwt>&taskId=<uuid>
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    const taskId = url.searchParams.get("taskId");

    if (!token || !taskId) return ws.close(4000, "Missing token or taskId");

    let userId;
    try {
      userId = verifySessionToken(token).sub;
    } catch {
      return ws.close(4001, "Invalid or expired session");
    }

    // Same permission rule as the REST send route: only the task's
    // assignee or an admin can be in this chat at all.
    const { rows } = await pool.query(
      `select t.assignee_id, p.role
         from tasks t, profiles p
        where t.id = $1 and p.id = $2`,
      [taskId, userId]
    );
    const row = rows[0];
    if (!row) return ws.close(4004, "Task not found");
    if (row.role !== "admin" && row.assignee_id !== userId) {
      return ws.close(4003, "Not authorized for this task's chat");
    }

    addConnection(taskId, ws);
    ws.on("close", () => removeConnection(taskId, ws));
    ws.on("error", () => removeConnection(taskId, ws));

    // Client-side sends a harmless periodic "ping" (see lib/socket.js on
    // the frontend) purely to keep the connection alive on Render's free
    // tier — nothing needs to happen with it here beyond just receiving
    // it, since an incoming WebSocket message alone is what resets
    // Render's idle timer.
    ws.on("message", () => {});
  });

  return wss;
}
