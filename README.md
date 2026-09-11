# Nixie Dashboard

A full-stack operations, lead tracking, task management, and communication dashboard built specifically for **Nixie**. 

The stack consists of a modern React client (`client`) and a high-performance Express backend (`server`) backed by a serverless **Neon PostgreSQL** database.

---

## 🌟 Key Features

- **Shopify Inbox & AI Lead Automation:**
  - **Shopify Orders:** Real-time synchronization via `orders-paid` webhooks (`POST /webhooks/shopify/orders-paid`) with HMAC SHA-256 verification. Orders are displayed with clear assignment tracking.
  - **AI Outfit Analyzer Leads:** Synchronized via `draft-orders-create` webhooks (`POST /webhooks/shopify/draft-orders-create`). Automatically maps customer info, outfit type, fabric selections, estimated pricing, and outfit images from custom line item properties.
  - **Staff Assignment:** Clean assignment controls allowing admins to assign/reassign orders and leads only to active, verified staff members.
- **Task Management & Real-Time Tracking:**
  - Complete lifecycle tracking for custom stitching, alterations, and client orders with progress stages (e.g., Fabric Sourced, In Stitching, Quality Check, Ready, Delivered).
  - Internal and client communication threads directly tied to each task.
- **WhatsApp Cloud API Integration:**
  - Send direct automated progress updates and messages to customers over WhatsApp via Meta's WhatsApp Business Cloud API.
  - Inbound webhook processing (`POST /webhooks/whatsapp`) with verify token handshake and incoming message handling.
- **Team & Permissions:**
  - Role-based access control (`admin` and `staff`).
  - Invite flow with email invitations sent via **Brevo** transactional emails.
  - Secure authentication using JWT and `bcrypt` password hashing.
- **GPS-Based Attendance:**
  - Geofence verification (Haversine formula) for staff clock-in/clock-out against the physical office latitude/longitude.
  - Configurable office coordinates, allowed radius (meters), and shift start time (with UI overrides).
- **Approvals & Financial Records:**
  - Leave requests and expense/reimbursement claim workflows with admin approvals.
  - Image attachments powered by **ImageKit** with secure server-side upload authentication.
- **Web Push Notifications:**
  - Desktop and mobile browser push notifications powered by VAPID / Service Workers for new orders, leads, and task assignments.

---

## 🏗️ Architecture & Technology Stack

- **Frontend (`client`):**
  - React 19 + Vite
  - Tailwind CSS + Lucide Icons + Framer Motion
  - Service Worker for Web Push notifications
- **Backend (`server`):**
  - Node.js & Express
  - Native PostgreSQL connection pooling via `pg` connecting to **Neon Serverless Postgres**
  - Raw body HMAC signature verification for Shopify webhooks
  - Brevo API for transactional email invites & password resets
  - ImageKit SDK for media management
  - Web-push library for browser notifications
- **Database:**
  - **Neon PostgreSQL** (Postgres 16+) with pooled and direct connection support.

---

## 🚀 Getting Started

### 1. Database Setup (Neon)
1. Log in to [Neon Console](https://console.neon.tech) and create your project database.
2. In the Neon SQL Editor, execute the consolidated schema (`server/schema.sql`).

### 2. Backend Setup (`server`)
1. Navigate to the server folder:
   ```bash
   cd server
   npm install
   ```
2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   *Fill in your database connection strings, JWT secret, and integration credentials. See `server/.env.example` for details and developer vs client labels.*
3. Seed the initial admin user:
   ```bash
   npm run seed:admin
   ```
4. Start the server:
   ```bash
   npm run dev
   ```
   *Server runs on http://localhost:5001 by default.*

### 3. Frontend Setup (`client`)
1. Navigate to the client folder:
   ```bash
   cd client
   npm install
   ```
2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   *Verify `VITE_API_BASE_URL` points to `http://localhost:5001` (or your production API URL).*
3. Start the client:
   ```bash
   npm run dev
   ```
   *Client runs on http://localhost:5173.* Log in using the admin credentials created in step 2.3.

---

## 🔗 Shopify Webhook Registration

To receive live orders and AI leads, register these webhook endpoints in **Shopify Admin → Settings → Notifications → Webhooks**:

| Event | URL to Register | Format |
|---|---|---|
| **Order payment** | `https://<your-backend-domain>/webhooks/shopify/orders-paid` | JSON |
| **Draft order creation** | `https://<your-backend-domain>/webhooks/shopify/draft-orders-create` | JSON |

*Make sure your `SHOPIFY_WEBHOOK_SECRET` matches the signature key shown at the bottom of the Shopify webhooks page.*

---

## 🎨 Theming

The primary accent colors can be adjusted in `client/tailwind.config.js` under the `colors.accent` block. Preset palettes (blue, black, navy, emerald) are documented directly in that file.