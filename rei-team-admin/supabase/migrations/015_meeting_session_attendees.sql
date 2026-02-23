-- Store attendance data per meeting session (who was present, absent, guest)
create table if not exists public.meeting_session_attendees (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meeting_minutes_sessions(id) on delete cascade,
  email text,
  full_name text,
  is_present boolean not null default true,
  is_guest boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_session_attendees_session on public.meeting_session_attendees (session_id);
