-- Leads: add normalized email column + unique index for safe upserts
-- Enables bulk import with dedupe/upsert on email.

alter table public.leads
  add column if not exists email_lower text generated always as (lower(email)) stored;

create unique index if not exists leads_email_lower_unique
  on public.leads (email_lower)
  where email_lower is not null and email_lower <> '';

-- Optional: speed up filters/sorts
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_last_contacted_at_idx on public.leads (last_contacted_at desc);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
