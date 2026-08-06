-- =====================================================================
-- AC Lab Tracker — Admin approval for new accounts
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste all -> Run.
-- =====================================================================
-- Before this file, ANY logged-in account could read and write everything
-- (every policy was "to authenticated using (true)"), and the company-email
-- check lived only in the browser, so it could be bypassed.
--
-- After this file, access requires a row in public.allowed_users with
-- approved = true. New sign-ups land there as pending until an admin
-- approves them, in the app or in the Table Editor.
--
-- !! READ THIS BEFORE RUNNING !!
--  * Step 5 grandfathers EVERY existing account so nobody currently using
--    the app is locked out.
--  * Step 6 makes you an admin. EDIT THE EMAIL THERE FIRST — if you skip it,
--    nobody can approve anyone and you will have to come back here.
-- =====================================================================

-- 1) The approval list ------------------------------------------------
create table if not exists public.allowed_users (
  email        text primary key,          -- always stored lowercase
  approved     boolean     not null default false,
  is_admin     boolean     not null default false,
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  text,
  note         text
);

alter table public.allowed_users enable row level security;

-- 2) Helpers ----------------------------------------------------------
-- SECURITY DEFINER so these can read allowed_users without tripping the
-- policies below (that also stops the policies recursing into themselves).
create or replace function public.is_approved()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(auth.jwt() ->> 'email') and approved
  );
$$;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(auth.jwt() ->> 'email') and approved and is_admin
  );
$$;

revoke all on function public.is_approved() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 3) Who may see / change the approval list ---------------------------
-- Everyone may read their OWN row (so the app can show "pending"); admins see all.
drop policy if exists "allowed_users read" on public.allowed_users;
create policy "allowed_users read" on public.allowed_users
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or public.is_admin());

-- A new user may file a request for themselves, but cannot self-approve:
-- the WITH CHECK pins the email to their own and forces the flags to false.
drop policy if exists "allowed_users request" on public.allowed_users;
create policy "allowed_users request" on public.allowed_users
  for insert to authenticated
  with check (
    email = lower(auth.jwt() ->> 'email')
    and approved = false
    and is_admin = false
  );

drop policy if exists "allowed_users admin write" on public.allowed_users;
create policy "allowed_users admin write" on public.allowed_users
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "allowed_users admin delete" on public.allowed_users;
create policy "allowed_users admin delete" on public.allowed_users
  for delete to authenticated using (public.is_admin());

drop policy if exists "allowed_users admin insert" on public.allowed_users;
create policy "allowed_users admin insert" on public.allowed_users
  for insert to authenticated with check (public.is_admin());

-- 4) Gate the actual data ---------------------------------------------
drop policy if exists "records all"  on public.records;
create policy "records all"  on public.records  for all to authenticated
  using (public.is_approved()) with check (public.is_approved());

drop policy if exists "projects all" on public.projects;
create policy "projects all" on public.projects for all to authenticated
  using (public.is_approved()) with check (public.is_approved());

drop policy if exists "logs all"     on public.logs;
create policy "logs all"     on public.logs     for all to authenticated
  using (public.is_approved()) with check (public.is_approved());

drop policy if exists "settings all" on public.app_settings;
create policy "settings all" on public.app_settings for all to authenticated
  using (public.is_approved()) with check (public.is_approved());

-- lab_instruments only exists if aclab-lab-instruments-setup.sql was run
do $$
begin
  if to_regclass('public.lab_instruments') is not null then
    execute 'drop policy if exists "lab_instruments all" on public.lab_instruments';
    execute 'create policy "lab_instruments all" on public.lab_instruments for all to authenticated
             using (public.is_approved()) with check (public.is_approved())';
  end if;
end $$;

-- push_subscriptions only exists if aclab-push-setup.sql was run
do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    execute 'drop policy if exists "push insert" on public.push_subscriptions';
    execute 'drop policy if exists "push update" on public.push_subscriptions';
    execute 'drop policy if exists "push select" on public.push_subscriptions';
    execute 'drop policy if exists "push delete" on public.push_subscriptions';
    execute 'create policy "push insert" on public.push_subscriptions for insert to authenticated with check (public.is_approved())';
    execute 'create policy "push update" on public.push_subscriptions for update to authenticated using (public.is_approved()) with check (public.is_approved())';
    execute 'create policy "push select" on public.push_subscriptions for select to authenticated using (public.is_approved())';
    execute 'create policy "push delete" on public.push_subscriptions for delete to authenticated using (public.is_approved())';
  end if;
end $$;

-- Screenshots / attachments: uploading and deleting now needs approval too.
-- (Reading stays public — the bucket is public and the app links to files directly.)
drop policy if exists "aclab attachments insert" on storage.objects;
create policy "aclab attachments insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_approved());

drop policy if exists "aclab attachments update" on storage.objects;
create policy "aclab attachments update" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and public.is_approved());

drop policy if exists "aclab attachments delete" on storage.objects;
create policy "aclab attachments delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and public.is_approved());

-- 5) Grandfather everyone who already has an account ------------------
--    Nobody currently using the app gets locked out by this migration.
insert into public.allowed_users (email, approved, approved_at, approved_by, note)
select lower(u.email), true, now(), 'migration', 'existing account at approval rollout'
from auth.users u
where u.email is not null
on conflict (email) do update set approved = true;

-- 6) >>> EDIT THIS EMAIL <<< make yourself an admin --------------------
--     Use the address you sign in to AudioTracker with.
insert into public.allowed_users (email, approved, is_admin, approved_at, approved_by, note)
values (lower('CHANGE-ME@pal-labs.com'), true, true, now(), 'bootstrap', 'first admin')
on conflict (email) do update set approved = true, is_admin = true;

-- 7) Check the result --------------------------------------------------
select email, approved, is_admin, note from public.allowed_users order by is_admin desc, email;
