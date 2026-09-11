# Teamflow — Client (Stage 1)

This is the **frontend only**. It's built against Supabase directly for
almost everything, and against a backend server (stage 2, not in this
zip yet) for the few actions that need secret keys:

- Sending a message with "Message client" on → real WhatsApp send
- Progress slider updates → also triggers the client WhatsApp update
- Attendance check-in → GPS/Haversine geofence validation
- Adding a team member with a password → uses the Supabase service-role key
- Receipt image upload → ImageKit signature generation

Until that backend exists, those specific actions will fail with a
network error — everything else (viewing tasks, Shopify inbox, approvals
list, leave/reimbursement history, performance) works against Supabase
right now.

## 1. Install

```bash
cd client
npm install
```

## 2. Set up Supabase

1. Go to https://supabase.com → create a free project.
2. In the Supabase dashboard, open **SQL Editor** → paste the full
   contents of `supabase/schema.sql` from this folder → run it. This
   creates all tables and Row Level Security policies.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
4. Create your first Admin user manually for now (until the backend's
   admin-seed script exists): **Authentication → Users → Add user** in
   the Supabase dashboard, then in **SQL Editor** run:
   ```sql
   insert into profiles (id, name, email, role)
   values ('<paste the new user's UUID from Authentication>', 'Your Name', 'you@example.com', 'admin');
   ```

## 3. Set up ImageKit (for receipt uploads)

1. Sign up at https://imagekit.io → create a project.
2. Go to **Developer options** and copy:
   - **URL-endpoint** → `VITE_IMAGEKIT_URL_ENDPOINT`
   - **Public key** → `VITE_IMAGEKIT_PUBLIC_KEY`
   - (Keep the **Private key** for stage 2's backend — never put it here.)

## 4. Configure environment

```bash
cp .env.example .env
```
Fill in the four values above. Leave `VITE_API_BASE_URL` as
`http://localhost:5000` — that's where stage 2's backend will run.

## 5. Run it

```bash
npm run dev
```
Opens at http://localhost:5173. Log in with the admin account you
created in step 2.4.

## Theming

Open `tailwind.config.js` — the `colors.accent` block (3 hex codes)
controls the entire app's color. A few ready-made presets are listed as
comments right above it (blue, black/monochrome, navy, green) — copy one
in, save, and the whole dashboard re-themes.

## What's next (stage 2)

The Express backend — Shopify webhook receiver, WhatsApp send, GPS
check-in validation, ImageKit signature endpoint, and the admin-seed
script — comes as a separate `server` folder and zip.
