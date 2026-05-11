-- ============================================================
-- 031: Track emails sent from Alan's Workspace
-- ============================================================

alter table public.emails
  add column if not exists local_origin boolean not null default false;

comment on column public.emails.local_origin is
  'True if this email was sent from Alans Workspace; false if synced from provider';

create index if not exists idx_emails_local_origin
  on public.emails (account_id, local_origin, sent_at desc)
  where local_origin = true;
