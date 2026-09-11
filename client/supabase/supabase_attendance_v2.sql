-- Attendance v2 Migration (Supabase / Postgres)
-- Run this in your Supabase SQL Editor.

-- 1. Ensure settings table exists and has all default rows
create table if not exists settings (
  key text primary key,
  value jsonb not null
);

insert into settings (key, value) values
  ('office_start_time', '"09:30"'),
  ('office_end_time', '"17:00"'),
  ('office_location', '{"lat": 0, "lng": 0, "radius_meters": 120}'),
  ('performance_weights', '{"punctuality": 0.4, "task_on_time": 0.6}')
on conflict (key) do nothing;

-- 2. Remove unique constraint on (staff_id, date) to allow multiple sessions per day
alter table attendance drop constraint if exists attendance_staff_id_date_key;

-- 3. Add new columns to attendance table
alter table attendance
  add column if not exists work_mode text not null default 'office' check (work_mode in ('office', 'home')),
  add column if not exists auto_closed boolean not null default false,
  add column if not exists overtime_minutes int not null default 0;

-- 4. Holidays table
create table if not exists holidays (
  date date primary key,
  name text not null,
  source text not null default 'custom' check (source in ('national', 'custom')),
  created_at timestamptz not null default now()
);

alter table holidays enable row level security;

-- Drop existing policies if any to avoid errors on rerun
drop policy if exists "holidays are readable by any authenticated user" on holidays;
drop policy if exists "only admins can insert/update/delete holidays" on holidays;

create policy "holidays are readable by any authenticated user"
  on holidays for select using (auth.role() = 'authenticated');

create policy "only admins can insert/update/delete holidays"
  on holidays for all using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );
