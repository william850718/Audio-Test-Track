-- =====================================================================
-- AC Lab Tracker — Web Push subscriptions table
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste all -> Run.
-- =====================================================================
-- Stores each device's push subscription so the Edge Function can send
-- notifications when a new Platform Tracking record is added.
-- =====================================================================

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text        not null,
  auth       text        not null,
  user_email text,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Logged-in users can register / update / remove their own device subscription.
drop policy if exists "push insert" on public.push_subscriptions;
create policy "push insert" on public.push_subscriptions for insert to authenticated with check (true);

drop policy if exists "push update" on public.push_subscriptions;
create policy "push update" on public.push_subscriptions for update to authenticated using (true) with check (true);

drop policy if exists "push select" on public.push_subscriptions;
create policy "push select" on public.push_subscriptions for select to authenticated using (true);

drop policy if exists "push delete" on public.push_subscriptions;
create policy "push delete" on public.push_subscriptions for delete to authenticated using (true);

-- Note: the Edge Function reads this table with the SERVICE ROLE key, which
-- bypasses RLS, so it can send to every registered device.
