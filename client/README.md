# Nixie Dashboard — Frontend Client

The frontend client for **Nixie Dashboard**, built with **React 19**, **Vite**, and **Tailwind CSS**.

---

## 🚀 Features

- **Dashboard & Task Pipeline:** Real-time visibility into active stitching, alteration, and client tasks with progress updates.
- **Shopify Inbox:** Unified tabbed interface for incoming paid Shopify orders and AI Outfit Analyzer draft leads with dedicated staff assignment controls and independent pagination.
- **Task Conversations & Multi-Order Group-Chat:**
  - Real-time bidirectional chat powered by WebSockets (`/ws/task-chat`) with automatic reconnect, ping keep-alives, and fallback to polling.
  - Multi-order chat mirroring with a contextual top banner displaying sibling active orders and their assigned staff.
  - Chat history "load earlier" pagination preserving scroll position.
- **Attendance Clock-In:** Geofenced GPS attendance verification with on-time / late calculation.
- **Approvals:** Paginated leave requests and expense reimbursements with receipt previews and live badge counts.
- **Team Management:** Admin controls for inviting staff, sending welcome emails, and role management.
- **Notifications & Web Push:** Real-time push alerts via Service Worker/VAPID, top notification bell with 20s visibility-aware polling, and full paginated `/notifications` history page.

---

## 🛠️ Setup & Installation

### 1. Install Dependencies

```bash
cd client
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure the following variables in `client/.env`:

| Key | Description | Managed By |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the running Nixie backend (e.g. `http://localhost:5001` or deployed URL) | `[SET BY DEVELOPER]` |
| `VITE_IMAGEKIT_URL_ENDPOINT` | ImageKit URL Endpoint for rendering and uploading images | `[ASK NIXIE TEAM]` |
| `VITE_IMAGEKIT_PUBLIC_KEY` | ImageKit Public Key | `[ASK NIXIE TEAM]` |
| `VITE_VAPID_PUBLIC_KEY` | Public VAPID key for browser web push subscriptions | `[SET BY DEVELOPER]` |

### 3. Run Development Server

```bash
npm run dev
```

The application will be accessible at `http://localhost:5173`.

---

## 🎨 Theming

All theme colors are configured in `client/tailwind.config.js` via the `colors.accent` property. Pre-configured palettes (e.g., custom neon/blue, dark, emerald) can be switched directly there.
