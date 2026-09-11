# Teamflow

Full project: `client` (React + Tailwind + Supabase) and `server`
(Express — Shopify/WhatsApp/attendance/ImageKit).

## Run order

1. **Supabase first** — create the project and run `client/supabase/schema.sql`
   in the SQL editor (see `client/README.md` step 2).
2. **Server** — `cd server`, follow `server/README.md`, run
   `npm run seed:admin` once to create your first login, then
   `npm run dev` (http://localhost:5000).
3. **Client** — `cd client`, follow `client/README.md`, `npm run dev`
   (http://localhost:5173). Log in with the admin account from step 2.

## Theming

One place: `client/tailwind.config.js` → the `colors.accent` block.
Presets (blue / black / navy / green) are in the comments right above it.

## Full env key checklist

| Key | Where it's used | Where to get it |
|---|---|---|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | client + server | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | client | Supabase → Project Settings → API (anon public) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Supabase → Project Settings → API (service_role — keep secret) |
| `VITE_IMAGEKIT_URL_ENDPOINT` / `IMAGEKIT_URL_ENDPOINT` | client + server | ImageKit dashboard → Developer options |
| `VITE_IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PUBLIC_KEY` | client + server | ImageKit dashboard → Developer options |
| `IMAGEKIT_PRIVATE_KEY` | server only | ImageKit dashboard → Developer options (keep secret) |
| `SHOPIFY_STORE_DOMAIN` | server | your `*.myshopify.com` domain |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | server | Shopify Dev Dashboard → your app (app and store must be in the same organization) |
| `SHOPIFY_API_VERSION` | server | current API version string, e.g. `2026-01` |
| `SHOPIFY_WEBHOOK_SECRET` | server | shown when you create the webhook subscription |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | server | developers.facebook.com → your app → WhatsApp → API Setup |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | server (seed script) | whatever you want your first login to be |
| `OFFICE_LAT` / `OFFICE_LNG` / `OFFICE_RADIUS_METERS` / `OFFICE_START_TIME` | server | Google Maps for coordinates; your own office rules for the rest |
| `VITE_API_BASE_URL` | client | `http://localhost:5000` locally, or your deployed server URL |

Full step-by-step detail for each is in `client/README.md` and
`server/README.md`.