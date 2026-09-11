# Teamflow — Server (Stage 2)

Express backend for everything that needs a secret key: Shopify webhooks,
WhatsApp sending, GPS attendance validation, admin-created team members,
and ImageKit upload signatures.

## 1. Install

```bash
cd server
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

### Supabase
- `SUPABASE_URL` — same value as the client's `VITE_SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → **Project Settings →
  API → service_role secret**. This key bypasses Row Level Security —
  keep it server-only, never in the client `.env`.

### First admin account
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` — whatever you want your
  first login to be. Running `npm run seed:admin` creates this account
  once (safe to re-run — it skips if the email already exists).

```bash
npm run seed:admin
```

### Office attendance geofence
- `OFFICE_LAT` / `OFFICE_LNG` — your office's coordinates. Easiest way:
  open Google Maps, right-click your office location, click the
  coordinates to copy them.
- `OFFICE_RADIUS_METERS` — how close (in meters) staff must be to check
  in. 100–150 is a reasonable range.
- `OFFICE_START_TIME` — 24h format, e.g. `09:30`. Used to mark check-ins
  as on-time vs late.

### ImageKit
- `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` —
  ImageKit dashboard → **Developer options**. The public key/endpoint
  should match what you put in the client's `.env`; the private key only
  goes here.

### Shopify
Apps created through Shopify's **Dev Dashboard** (which is what you get a
Client ID + Client Secret from) don't issue a static Admin API token
anymore — instead the backend exchanges the Client ID + Secret for a
24-hour access token itself, using the **Client Credentials Grant**.
This only works if the app and the store are in the **same Shopify
organization** (check this in the Dev Dashboard before going further).
`src/lib/shopifyAuth.js` handles requesting and auto-refreshing this
token — every Shopify Admin API call should go through it.

1. In the Shopify Dev Dashboard, confirm your app and
   `SHOPIFY_STORE_DOMAIN` are under the same organization.
2. Copy your app's **Client ID** → `SHOPIFY_CLIENT_ID` and **Client
   Secret** → `SHOPIFY_CLIENT_SECRET`. Set `SHOPIFY_API_VERSION` to a
   current API version string (e.g. `2026-01`).
3. Set `SHOPIFY_STORE_DOMAIN` to `your-store.myshopify.com`.
4. Make sure the app has the Admin API scopes it needs: `read_orders`,
   `read_customers`, `read_products`.
5. Create webhook subscriptions pointing at your server (once it's
   deployed somewhere reachable — for local dev, use a tunnel like
   `ngrok http 5000`):
   - Topic `orders/create` → `https://<your-url>/webhooks/shopify/orders-create`
   - Topic `draft_orders/create` → `https://<your-url>/webhooks/shopify/draft-orders-create`
6. Shopify shows you a signing secret when you create the webhook →
   `SHOPIFY_WEBHOOK_SECRET`.

> The draft-order → lead mapping in
> `src/routes/webhooksShopify.js` reads `note_attributes` for the AI
> price analyzer's outfit type / price estimate / image / message. Check
> the actual field names the analyzer writes into the draft order and
> adjust the `attr(...)` calls in that file to match exactly.

### WhatsApp (Meta Cloud API)
1. Go to https://developers.facebook.com → create an app → add the
   **WhatsApp** product.
2. Under **API Setup**, copy the **Phone number ID** →
   `WHATSAPP_PHONE_NUMBER_ID`, and generate/copy a permanent **access
   token** → `WHATSAPP_ACCESS_TOKEN`.
3. Note: the first message to a client outside a 24-hour reply window
   requires a pre-approved message template — plain text like the
   progress-update message here works once the client has messaged you
   first, or once you've set up an approved template.

## 3. Run it

```bash
npm run dev
```
Runs on http://localhost:5000 by default (matches the client's
`VITE_API_BASE_URL`). Check it's alive:
```bash
curl http://localhost:5000/health
```

## Notes

- Every `/api/*` route requires a valid Supabase session token (the
  client sends this automatically once logged in).
- The Shopify webhook routes are the only ones that verify a signature
  instead of a login session — that's how Shopify itself authenticates.