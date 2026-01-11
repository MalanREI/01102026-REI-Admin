-- Meetings v2 (closer to the Google Sheets / Apps Script tracker)
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

create extension if not exists "pgcrypto";

-- Optional per-user color (for owner color coding)
alter table if exists public.profiles
  add column if not exists color_hex text;

-- Meetings: one row per recurring/standing meeting (Operations Weekly, Finance Review, etc.)
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  start_at timestamptz not null,
  duration_minutes int not null default 60,
  -- RFC5545 RRULE (optional) e.g. FREQ=WEEKLY;INTERVAL=1
  rrule text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meetings_start_at on public.meetings (start_at);

-- Meeting attendees (email-based; user_id if that email matches a registered account)
create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, email)
);

-- Agenda topics for a meeting (editable)
create table if not exists public.meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  code text,                 -- optional: A1, A2, B1...
  title text not null,
  description text,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agenda_meeting on public.meeting_agenda_items (meeting_id, position);

-- One row per "meeting minutes" run (New meeting minutes → creates a new session)
create table if not exists public.meeting_minutes_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_minutes_sessions_meeting on public.meeting_minutes_sessions (meeting_id, started_at desc);

-- Notes per agenda topic per session (current minutes per topic)
create table if not exists public.meeting_agenda_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meeting_minutes_sessions(id) on delete cascade,
  agenda_item_id uuid not null references public.meeting_agenda_items(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, agenda_item_id)
);

create index if not exists idx_agenda_notes_session on public.meeting_agenda_notes (session_id);

-- Task board columns per meeting (Milestones, Residential Ops, etc.)
create table if not exists public.meeting_task_columns (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  name text not null,
  position int not null default 1,
  created_at timestamptz not null default now(),
  unique (meeting_id, name)
);

create index if not exists idx_task_columns_meeting on public.meeting_task_columns (meeting_id, position);

-- Tasks/cards
create table if not exists public.meeting_tasks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  column_id uuid not null references public.meeting_task_columns(id) on delete cascade,
  title text not null,
  status text not null default 'In Progress',
  priority text not null default 'Normal',
  owner_id uuid references auth.users(id) on delete set null,
  start_date date,
  due_date date,
  notes text,
  position int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_meeting_column on public.meeting_tasks (meeting_id, column_id, position);

-- Audit trail / change log per task
create table if not exists public.meeting_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.meeting_tasks(id) on delete cascade,
  event_type text not null,      -- e.g. created, updated, moved, note_added, completed
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_events_task on public.meeting_task_events (task_id, created_at desc);

-- Audio recordings per minutes session
create table if not exists public.meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meeting_minutes_sessions(id) on delete cascade,
  storage_path text not null,
  duration_seconds int,
  transcript text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recordings_session on public.meeting_recordings (session_id);

-- Google OAuth tokens per user for Calendar API access (separate from Supabase Auth)
create table if not exists public.google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text,
  access_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =========
-- RLS
-- =========
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_agenda_items enable row level security;
alter table public.meeting_minutes_sessions enable row level security;
alter table public.meeting_agenda_notes enable row level security;
alter table public.meeting_task_columns enable row level security;
alter table public.meeting_tasks enable row level security;
alter table public.meeting_task_events enable row level security;
alter table public.meeting_recordings enable row level security;
alter table public.google_oauth_tokens enable row level security;

-- Internal app: all authenticated users can CRUD everything for now
create policy "meetings_all" on public.meetings for all to authenticated using (true) with check (true);
create policy "meeting_attendees_all" on public.meeting_attendees for all to authenticated using (true) with check (true);
create policy "meeting_agenda_items_all" on public.meeting_agenda_items for all to authenticated using (true) with check (true);
create policy "meeting_minutes_sessions_all" on public.meeting_minutes_sessions for all to authenticated using (true) with check (true);
create policy "meeting_agenda_notes_all" on public.meeting_agenda_notes for all to authenticated using (true) with check (true);
create policy "meeting_task_columns_all" on public.meeting_task_columns for all to authenticated using (true) with check (true);
create policy "meeting_tasks_all" on public.meeting_tasks for all to authenticated using (true) with check (true);
create policy "meeting_task_events_all" on public.meeting_task_events for all to authenticated using (true) with check (true);
create policy "meeting_recordings_all" on public.meeting_recordings for all to authenticated using (true) with check (true);

-- Tokens: user can read/update only their row
create policy "google_tokens_select_own" on public.google_oauth_tokens for select to authenticated using (auth.uid() = user_id);
create policy "google_tokens_upsert_own" on public.google_oauth_tokens for insert to authenticated with check (auth.uid() = user_id);
create policy "google_tokens_update_own" on public.google_oauth_tokens for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
