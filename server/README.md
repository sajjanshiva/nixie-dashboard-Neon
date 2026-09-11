# Nixie Dashboard — Express Server

Backend API service for **Nixie Dashboard**, providing database management via **Neon PostgreSQL**, Shopify webhook receivers, WhatsApp Cloud API integration, Brevo email invites, GPS attendance verification, and Web Push notifications.

---

## 🛠️ Prerequisites & Installation

```bash
cd server
npm install
```

---

## ⚙️ Configuration (`.env`)

Copy the `.env.example` template:

```bash
cp .env.example .env
```

### Essential Settings:

1. **Neon PostgreSQL:**
   - `DATABASE_URL`: Pooled connection string from Neon Console (`-pooler` host) for regular queries.
   - `DIRECT_URL`: Direct connection string from Neon Console for schema migrations.
2. **Authentication:**
   - `JWT_SECRET`: Random 64-character string (`node -e "console.log(crypto.randomBytes(32).toString('hex'))"`).
3. **First Admin Seed Account:**
   - `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: Used by `npm run seed:admin` to create the initial admin user.
4. **Shopify Integration:**
   - `SHOPIFY_STORE_DOMAIN`: `your-store.myshopify.com`
   - `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`: App credentials from Shopify Partners / Dev Dashboard.
   - `SHOPIFY_WEBHOOK_SECRET`: Signing secret shown when registering webhooks.
5. **Meta WhatsApp Cloud API:**
   - `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`.
6. **Brevo (Transactional Emails):**
   - `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`.
7. **ImageKit:**
   - `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`.
8. **Web Push & Geofencing:**
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: Web Push credentials (`npx web-push generate-vapid-keys`).
   - `OFFICE_LAT`, `OFFICE_LNG`, `OFFICE_RADIUS_METERS`, `OFFICE_START_TIME`: Office GPS bounds for attendance clock-in.

---

## 🚀 Running the Server

### 1. Seed Initial Admin

```bash
npm run seed:admin
```

### 2. Start in Development Mode

```bash
npm run dev
```

The server listens on **`http://localhost:5001`** by default.

### 3. Verify Health Check

```bash
curl http://localhost:5001/health
```

---

## 🔗 Shopify Webhook Setup

Register these webhooks in **Shopify Admin → Settings → Notifications → Webhooks**:

1. **Order payment:**
   - Event: `Order payment`
   - Format: `JSON`
   - URL: `https://<your-server-url>/webhooks/shopify/orders-paid`
2. **Draft order creation:**
   - Event: `Draft order creation`
   - Format: `JSON`
   - URL: `https://<your-server-url>/webhooks/shopify/draft-orders-create`

> **Note:** Shopify webhooks are signed using HMAC SHA-256. The server receives raw request bodies on `/webhooks/*` and verifies signatures with `SHOPIFY_WEBHOOK_SECRET` before processing.