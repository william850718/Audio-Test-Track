-- =====================================================================
-- AC Lab Tracker — Lab Instruments table
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste all -> Run.
-- =====================================================================
-- Stores each lab's instrument / software inventory (name, version, when it
-- last changed) plus the last time the lab was verified. One row per lab,
-- id = lab name (A1, A2, ...). The instrument list lives in the jsonb "data"
-- column, so no schema change is needed when fields differ between labs.
-- The app degrades gracefully if this table is missing (Lab Instruments just
-- shows empty), so existing Platform Tracking / Project Log keep working.
-- =====================================================================

create table if not exists public.lab_instruments (
  id         text primary key,
  data       jsonb        not null default '{}'::jsonb,
  updated_at timestamptz  not null default now(),
  updated_by text
);

alter table public.lab_instruments enable row level security;

drop policy if exists "lab_instruments all" on public.lab_instruments;
create policy "lab_instruments all" on public.lab_instruments
  for all to authenticated using (true) with check (true);

-- Realtime so updates propagate to everyone (ignore "already added")
do $$
begin
  begin alter publication supabase_realtime add table public.lab_instruments; exception when others then null; end;
end $$;
