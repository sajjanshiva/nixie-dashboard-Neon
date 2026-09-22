-- =============================================================================
-- Nixie Dashboard — Neon schema (consolidated)
-- Run this ONCE in the Neon SQL Editor on a fresh database.
-- Merges: old schema.sql + supabase_attendance_v2.sql + the schema-diff file.
-- Removed entirely: all RLS policies (Neon has no auth.uid()/auth.role() —
-- every permission check now lives in Express route handlers instead) and
-- all pg_net trigger wiring (Neon has no pg_net — notification-on-insert
-- logic moves into application code in Round 2).
-- =============================================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- profiles — one row per admin/staff account.
-- password_hash / invite_token / invite_expires_at are new: an account
-- exists (and shows in the Team tab) from the moment it's invited, but
-- has no password_hash until the person actually accepts the invite.
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text,                                   -- null until invite accepted
  email text not null unique,
  role text not null,                          -- 'admin', 'staff', or a name from custom_roles (see below) — validated at the app layer, not by a DB constraint, since the valid set changes as admin manages roles
  title text,                                   -- deprecated, unused — kept only so old rows/queries referencing it don't break; role now holds the display name directly
  password_hash text,                          -- null until invite accepted
  invite_token text unique,                     -- cleared once accepted 
  invite_expires_at timestamptz,
  reset_token text,                             -- single-use forgot-password token; cleared once used
  reset_token_expires_at timestamptz,           -- 1 hour from request
  activated_at timestamptz,                     -- set on FIRST check-in, not invite/password time
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_reset_token_uidx
  on profiles (reset_token) where reset_token is not null;

-- ---------------------------------------------------------------------
-- custom_roles — admin-managed role names (Designer, Tailor, ...), used
-- directly as the value of profiles.role for anyone given that role.
-- This is the full source of truth for which role names are valid,
-- alongside the two built-in ones (admin, staff) which are NOT rows
-- here. Plain lookup list, not a foreign key — renaming/removing a row
-- here never touches people who already have that value in profiles.role.
-- ---------------------------------------------------------------------
create table custom_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  client_name text,
  client_phone text,
  due_date date,
  links text,
  assignee_id uuid references profiles (id),
  status text not null default 'In Progress' check (status in ('In Progress', 'Complete')),
  progress int not null default 0 check (progress between 0 and 100),
  source text not null default 'manual' check (source in ('shopify_order', 'manual')),
  shopify_order_id text,
  shopify_order_number text,
  shopify_items text,
  shopify_price text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- shopify_leads
-- ---------------------------------------------------------------------
create table shopify_leads (
  id uuid primary key default gen_random_uuid(),
  lead_number text,
  name text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  pincode text,
  outfit_type text,
  primary_fabric text,
  secondary_fabrics text[],
  price_estimate text,
  image_url text,
  message text,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'contacted')),
  assignee_id uuid references profiles (id),
  contacted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- shopify_orders — undocumented pre-existing table (per the live-DB
-- audit), reconstructed here to match exactly what the webhook inserts
-- and what the UI reads — not from schema.sql, which never had this
-- table at all.
-- ---------------------------------------------------------------------
create table shopify_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text unique,
  order_number text,
  customer_name text,
  customer_phone text,
  items text,
  price text,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned')),
  task_id uuid references tasks (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- messages — task conversation thread
-- ---------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  kind text not null check (kind in ('staff', 'client', 'system')),
  author_id uuid references profiles (id),
  author_name text,
  author_role text,
  is_client boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- leaves
-- ---------------------------------------------------------------------
create table leaves (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id),
  type text not null,
  reason_category text,
  date_from date not null,
  date_to date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- reimbursements
-- ---------------------------------------------------------------------
create table reimbursements (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id),
  category text not null,
  amount numeric not null,
  note text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- attendance — session-based (multiple check-in/out per day allowed),
-- with work mode, auto-close flag, and overtime tracking
-- ---------------------------------------------------------------------
create table attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id),
  date date not null default current_date,
  check_in timestamptz,
  check_out timestamptz,
  status text check (status in ('on_time', 'late', 'absent')),
  work_mode text check (work_mode in ('office', 'home')),
  auto_closed boolean not null default false,
  overtime_minutes integer not null default 0
);

-- ---------------------------------------------------------------------
-- settings — office hours + geofence, admin-editable
-- ---------------------------------------------------------------------
create table settings (
  key text primary key,
  value jsonb not null
);

insert into settings (key, value) values
  ('office_start_time', '"09:30"'),
  ('office_end_time', '"17:00"'),
  ('office_location', '{"lat": 13.0721, "lng": 77.7922, "radius_meters": 150}');

-- ---------------------------------------------------------------------
-- holidays — national (auto-fetched) + custom (admin-added)
-- ---------------------------------------------------------------------
create table holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  source text not null default 'custom' check (source in ('national', 'custom')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  text text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- push_subscriptions — one row per device that granted push permission
-- ---------------------------------------------------------------------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id),
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on push_subscriptions (user_id);