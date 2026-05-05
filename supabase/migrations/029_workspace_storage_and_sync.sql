-- ============================================================
-- 029: Workspace Storage Bucket & Sync Jobs
-- Email attachments storage, sync job tracking, column additions
-- ============================================================

-- ============================================================
-- 1. Storage bucket: email-attachments
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-attachments', 'email-attachments', false, 26214400, null)
on conflict (id) do nothing;

-- ============================================================
-- 2. Storage policies for email-attachments bucket
-- ============================================================

create policy "email_attachments_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'email-attachments'
  and owner = (select auth.uid())
);

create policy "email_attachments_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'email-attachments'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "email_attachments_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'email-attachments'
  and owner = (select auth.uid())
);

-- ============================================================
-- 3. Table: sync_jobs
-- ============================================================

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  job_type text not null check (job_type in ('initial_backfill', 'incremental_sync', 'attachment_extraction', 'reembed')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  backfill_days int,
  emails_synced int default 0,
  emails_total int,
  attachments_processed int default 0,
  last_message_id text,
  delta_link text,
  history_id text,
  error_message text,
  error_details jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sync_jobs_account_status_created
  on public.sync_jobs (account_id, status, created_at desc);

create index if not exists idx_sync_jobs_active
  on public.sync_jobs (status, created_at)
  where status in ('pending', 'running');

-- ============================================================
-- 4. RLS on sync_jobs
-- ============================================================

alter table public.sync_jobs enable row level security;

create policy sync_jobs_select on public.sync_jobs
  for select to authenticated using (user_id = (select auth.uid()));

create policy sync_jobs_insert on public.sync_jobs
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy sync_jobs_update on public.sync_jobs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy sync_jobs_delete on public.sync_jobs
  for delete to authenticated using (user_id = (select auth.uid()));

-- ============================================================
-- 5. updated_at trigger on sync_jobs
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'sync_jobs_set_updated_at') then
    create trigger sync_jobs_set_updated_at
      before update on public.sync_jobs
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

-- ============================================================
-- 6. Add backfill_days to connected_accounts
-- ============================================================

alter table public.connected_accounts
  add column if not exists backfill_days int default 90
    check (backfill_days in (30, 90, 365));

-- ============================================================
-- 7. Add columns to emails
-- ============================================================

alter table public.emails
  add column if not exists provider_etag text;

alter table public.emails
  add column if not exists folder_id text;

-- ============================================================
-- 8. Add column to email_attachments
-- ============================================================

alter table public.email_attachments
  add column if not exists provider_attachment_id text;
