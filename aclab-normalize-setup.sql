-- =====================================================================
-- AC Lab Tracker — Normalized schema for safe multi-user collaboration
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste all -> Run.
-- =====================================================================
-- Replaces the single-row "app_snapshot" model with one row per entity,
-- so concurrent users no longer overwrite each other's data.
-- The old app_snapshot table is NOT touched (kept as a backup / for the
-- one-time auto-migration the app performs on first load).
-- =====================================================================

-- 1) Tables ------------------------------------------------------------
create table if not exists public.records (
  id         text primary key,
  data       jsonb        not null default '{}'::jsonb,
  updated_at timestamptz  not null default now(),
  updated_by text
);

create table if not exists public.projects (
  id         text primary key,
  data       jsonb        not null default '{}'::jsonb,
  updated_at timestamptz  not null default now(),
  updated_by text
);

-- Logs use a composite key (project_id, id): the log id (e.g. LOG-001) is
-- only unique WITHIN a project, so we scope it by project.
create table if not exists public.logs (
  project_id text        not null references public.projects(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (project_id, id)
);
create index if not exists logs_project_idx on public.logs(project_id);

-- 2) Row Level Security: any logged-in user can read/write ------------
alter table public.records  enable row level security;
alter table public.projects enable row level security;
alter table public.logs     enable row level security;

drop policy if exists "records all"  on public.records;
create policy "records all"  on public.records  for all to authenticated using (true) with check (true);

drop policy if exists "projects all" on public.projects;
create policy "projects all" on public.projects for all to authenticated using (true) with check (true);

drop policy if exists "logs all"     on public.logs;
create policy "logs all"     on public.logs     for all to authenticated using (true) with check (true);

-- 3) Realtime: push row changes to all open clients -------------------
--    (safe to re-run: ignores "already added" errors)
do $$
begin
  begin alter publication supabase_realtime add table public.records;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.projects; exception when others then null; end;
  begin alter publication supabase_realtime add table public.logs;     exception when others then null; end;
end $$;

-- Done. Reload the app and sign in; existing data migrates automatically.
