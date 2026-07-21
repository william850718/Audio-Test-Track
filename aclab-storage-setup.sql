-- =====================================================================
-- AC Lab Tracker — Storage setup for screenshot attachments
-- Run this ONCE in your Supabase project: SQL Editor → New query → Run
-- =====================================================================
-- This creates a PUBLIC bucket named "attachments" used by the app to
-- store screenshots for Platform Tracking records and Project Logs.
-- The app stores only the file path in the data snapshot; the actual
-- image files live in this bucket.
--
-- "Public" here means: anyone who knows the file URL can view the image
-- (same exposure level as the anon key already shipped in index.html).
-- Uploading / deleting still requires a logged-in (authenticated) user.
-- =====================================================================

-- 1) Create the public bucket (id = name = 'attachments')
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

-- 2) Allow logged-in users to upload files into this bucket
drop policy if exists "aclab attachments insert" on storage.objects;
create policy "aclab attachments insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');

-- 3) Allow logged-in users to overwrite files in this bucket
drop policy if exists "aclab attachments update" on storage.objects;
create policy "aclab attachments update"
  on storage.objects for update to authenticated
  using (bucket_id = 'attachments');

-- 4) Allow logged-in users to delete files in this bucket
--    (used when an image is removed from a record before saving)
drop policy if exists "aclab attachments delete" on storage.objects;
create policy "aclab attachments delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments');

-- 5) Public read (a public bucket already serves files publicly, this
--    policy is harmless and makes the intent explicit)
drop policy if exists "aclab attachments read" on storage.objects;
create policy "aclab attachments read"
  on storage.objects for select to public
  using (bucket_id = 'attachments');
