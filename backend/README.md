# Backend

There is no application server. The browser talks to Supabase directly, so
"backend" here means the database schema, the row-level security that enforces
the rules, the Edge Function, and the scheduled job.

## What is where

| Folder | Holds |
|---|---|
| `models/` | Table definitions. Create the table, enable RLS, register for realtime — nothing else. |
| `middlewares/` | Every RLS policy, and the `is_approved()` / `is_admin()` helpers they call. |
| `rpc/` | Empty. Postgres functions that enforce a rule go here when the client stops writing rows directly. |
| `migrations/` | Empty. Changes after the initial setup belong here, numbered, rather than by editing `models/`. |

## Run order

Run these once, in this order, in the Supabase SQL editor:

```
models/01_records_projects_logs.sql
models/02_lab_instruments.sql
models/03_app_settings.sql
models/04_push_subscriptions.sql
models/05_attachments_bucket.sql
middlewares/policies.sql          <- last, and it is the one that matters
```

**Between the models and `policies.sql`, every table denies everything.** RLS is
on with no policy, which is the correct way to be half-configured: a table that
is not finished being set up should refuse, not allow.

## Why the split

Four of the original six scripts created their own permissive policies —
`to authenticated using (true)` — which the approval script then replaced with
`is_approved()`. Whichever ran last won, and nothing wrote down an order.

That meant re-running a table script, which is the first thing anyone does when
setting up a second environment, **silently removed the approval gate for that
table**: every signed-in account, including one still waiting to be approved,
got full read and write.

Now a table script cannot define a policy. The old ones are left commented out
in `models/05_attachments_bucket.sql` as a record of what used to be there.

## One thing to know about the attachment policies

Writing an attachment requires approval. *Reading* one only requires being signed
in — and the bucket is public regardless, so the app fetches images by public URL
and never goes through the policy at all. That is a real hole, not an oversight
in the reorganisation: it is the reason the private-bucket work exists. The
policy was moved here unchanged rather than quietly tightened, so that the
change is made deliberately, with the app updated to ask for signed URLs at the
same time.

## What stays outside this folder, and why

- **`supabase/functions/notify-push/`** — the Supabase CLI deploys from
  `supabase/functions/` by path. Moving it under `backend/` would mean passing
  `--project-dir` on every deploy.
- **`.github/workflows/`** — GitHub only runs workflows found in
  `.github/workflows/` at the repository root.

Both are owned by whoever owns this folder; they just cannot live in it.
