-- =====================================================================
-- AC Lab Tracker — App settings table (for the shared "Test Software" list)
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste all -> Run.
-- =====================================================================
-- Stores small shared configuration that every user sees & can manage
-- in-app (currently: the Test Software dropdown list). One row, id='config'.
-- =====================================================================

create table if not exists public.app_settings (
  id         text primary key,
  data       jsonb        not null default '{}'::jsonb,
  updated_at timestamptz  not null default now(),
  updated_by text
);

alter table public.app_settings enable row level security;

drop policy if exists "settings all" on public.app_settings;
create policy "settings all" on public.app_settings
  for all to authenticated using (true) with check (true);

-- Realtime so list changes propagate to everyone (ignore "already added")
do $$
begin
  begin alter publication supabase_realtime add table public.app_settings; exception when others then null; end;
end $$;
