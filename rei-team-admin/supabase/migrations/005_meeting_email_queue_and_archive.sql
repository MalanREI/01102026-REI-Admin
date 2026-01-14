-- Meeting email queue + meeting archive support
-- Safe to run multiple times.

-- Manual email sending state to minutes sessions
alter table if exists public.meeting_minutes_sessions
  add column if not exists email_status text not null default 'draft',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_sent_by uuid references auth.users(id) on delete set null,
  add column if not exists email_error text;

create index if not exists idx_minutes_sessions_email_status
  on public.meeting_minutes_sessions (email_status, meeting_id, started_at desc);

-- Archive meetings (soft-hide)
alter table if exists public.meetings
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists idx_meetings_archived
  on public.meetings (archived, start_at desc);

