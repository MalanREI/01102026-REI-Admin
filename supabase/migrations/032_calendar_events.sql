-- ============================================================
-- 032: Calendar Events + calendar_sync job type
-- ============================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,

  -- Microsoft Graph identifiers
  provider_event_id text not null,
  provider_etag text,
  ical_uid text,
  series_master_id text,

  -- Core event data
  subject text,
  body_preview text,
  body_html text,
  body_text text,

  -- Time
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_all_day boolean not null default false,
  time_zone text,

  -- Location
  location text,
  online_meeting_url text,
  online_meeting_provider text,

  -- People
  organizer_email text,
  organizer_name text,
  attendees jsonb default '[]'::jsonb,
  is_organizer boolean not null default false,
  response_status text,

  -- Status
  show_as text,
  sensitivity text,
  is_cancelled boolean not null default false,
  importance text,

  -- Recurrence
  is_recurring boolean not null default false,
  recurrence jsonb,

  -- Source tracking
  local_origin boolean not null default false,
  last_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (account_id, provider_event_id)
);

create index if not exists idx_calendar_events_account_time
  on public.calendar_events (account_id, start_at);
create index if not exists idx_calendar_events_account_endtime
  on public.calendar_events (account_id, end_at);
create index if not exists idx_calendar_events_project
  on public.calendar_events (ai_project_id);
create index if not exists idx_calendar_events_user_time
  on public.calendar_events (user_id, start_at);

-- RLS
alter table public.calendar_events enable row level security;

create policy calendar_events_select on public.calendar_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy calendar_events_insert on public.calendar_events
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy calendar_events_update on public.calendar_events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy calendar_events_delete on public.calendar_events
  for delete to authenticated using (user_id = (select auth.uid()));

-- updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'calendar_events_set_updated_at') then
    create trigger calendar_events_set_updated_at
      before update on public.calendar_events
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

-- Extend sync_jobs job_type check constraint to include calendar_sync
do $$
declare
  conname_var text;
begin
  select conname into conname_var
  from pg_constraint
  where conrelid = 'public.sync_jobs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%job_type%';

  if conname_var is not null then
    execute format('alter table public.sync_jobs drop constraint %I', conname_var);
  end if;
end $$;

alter table public.sync_jobs
  add constraint sync_jobs_job_type_check
  check (job_type in (
    'initial_backfill',
    'incremental_sync',
    'calendar_sync',
    'attachment_extraction',
    'reembed'
  ));
