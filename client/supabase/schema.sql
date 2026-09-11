-- Teamflow database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor once, on a fresh project.
-- Row Level Security (RLS) policies are included at the bottom —
-- review and tighten them for your exact needs before going live.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- profiles: one row per user, linked 1:1 to Supabase Auth's auth.users
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- tasks: the 3 sources (shopify_order / shopify_lead_followup / manual)
-- ---------------------------------------------------------------------
create table tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  client_name text,
  client_phone text,
  status text not null default 'In Progress' check (status in ('In Progress', 'Complete')),
  due_date date,
  progress int not null default 0 check (progress between 0 and 100),
  assignee_id uuid references profiles (id),
  source text not null default 'manual' check (source in ('shopify_order', 'manual')),
  shopify_order_id text,
  shopify_order_number text,
  shopify_items text,
  shopify_price text,
  description text,
  links text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- shopify_leads: draft orders from the AI price analyzer + contact form
-- ---------------------------------------------------------------------
create table shopify_leads (
  id uuid primary key default uuid_generate_v4(),
  lead_number text,
  name text,
  phone text,
  outfit_type text,
  price_estimate text,
  image_url text,
  message text,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned')),
  assignee_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- messages: task conversation thread (staff-only / client-whatsapp / system)
-- ---------------------------------------------------------------------
create table messages (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks (id) on delete cascade,
  kind text not null check (kind in ('staff', 'client', 'system')),
  author_id uuid references profiles (id),
  author_name text,
  is_client boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- leaves
-- ---------------------------------------------------------------------
create table leaves (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references profiles (id),
  type text not null,
  reason_category text,
  reason text,
  date_from date not null,
  date_to date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- reimbursements
-- ---------------------------------------------------------------------
create table reimbursements (
  id uuid primary key default uuid_generate_v4(),
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
-- attendance: one row per staff member per day
-- ---------------------------------------------------------------------
create table attendance (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references profiles (id),
  date date not null default current_date,
  check_in timestamptz,
  check_out timestamptz,
  status text check (status in ('on_time', 'late', 'absent')),
  unique (staff_id, date)
);

-- ---------------------------------------------------------------------
-- settings: singleton config row (office start time, geofence, theme)
-- ---------------------------------------------------------------------
create table settings (
  key text primary key,
  value jsonb not null
);

insert into settings (key, value) values
  ('office_start_time', '"09:30"'),
  ('office_location', '{"lat": 0, "lng": 0, "radius_meters": 120}'),
  ('performance_weights', '{"punctuality": 0.4, "task_on_time": 0.6}');

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles (id),
  text text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =======================================================================
-- Row Level Security
-- =======================================================================
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table shopify_leads enable row level security;
alter table messages enable row level security;
alter table leaves enable row level security;
alter table reimbursements enable row level security;
alter table attendance enable row level security;
alter table notifications enable row level security;

-- helper: is the current user an admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- profiles: everyone can read all profiles (needed for assignee names etc.)
create policy "profiles are readable by any authenticated user"
  on profiles for select using (auth.role() = 'authenticated');
create policy "only admins can insert/update profiles"
  on profiles for all using (is_admin());

-- tasks: admins see everything, staff see only their own assigned tasks
create policy "admins see all tasks" on tasks for select using (is_admin());
create policy "staff see their assigned tasks" on tasks for select
  using (assignee_id = auth.uid());
create policy "admins manage tasks" on tasks for all using (is_admin());
create policy "staff can update progress on their own task" on tasks for update
  using (assignee_id = auth.uid());

-- shopify_leads: admin only
create policy "admins manage leads" on shopify_leads for all using (is_admin());

-- messages: visible if you can see the parent task
create policy "read messages on visible tasks" on messages for select
  using (
    exists (
      select 1 from tasks t
      where t.id = messages.task_id
        and (is_admin() or t.assignee_id = auth.uid())
    )
  );
create policy "insert messages on visible tasks" on messages for insert
  with check (
    exists (
      select 1 from tasks t
      where t.id = messages.task_id
        and (is_admin() or t.assignee_id = auth.uid())
    )
  );

-- leaves: staff manage their own, admin sees/approves all
create policy "staff read own leaves" on leaves for select using (staff_id = auth.uid());
create policy "admin read all leaves" on leaves for select using (is_admin());
create policy "staff submit own leaves" on leaves for insert with check (staff_id = auth.uid());
create policy "admin update leaves" on leaves for update using (is_admin());

-- reimbursements: same pattern as leaves
create policy "staff read own reimbursements" on reimbursements for select using (staff_id = auth.uid());
create policy "admin read all reimbursements" on reimbursements for select using (is_admin());
create policy "staff submit own reimbursements" on reimbursements for insert with check (staff_id = auth.uid());
create policy "admin update reimbursements" on reimbursements for update using (is_admin());

-- attendance: staff manage their own, admin reads all
create policy "staff read own attendance" on attendance for select using (staff_id = auth.uid());
create policy "admin read all attendance" on attendance for select using (is_admin());
create policy "staff insert own attendance" on attendance for insert with check (staff_id = auth.uid());
create policy "staff update own attendance" on attendance for update using (staff_id = auth.uid());

-- notifications: only see your own
create policy "read own notifications" on notifications for select using (user_id = auth.uid());
create policy "update own notifications" on notifications for update using (user_id = auth.uid());
