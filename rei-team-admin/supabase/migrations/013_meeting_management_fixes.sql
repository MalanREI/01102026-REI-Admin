-- Migration: Meeting Management Fixes
-- Adds RLS policies for milestones and notes, priority management table, and attendee colors

-- 1. Enable RLS and add policies for milestones and ongoing notes
alter table public.meeting_milestones enable row level security;
alter table public.meeting_ongoing_notes enable row level security;

-- Allow authenticated users full access (internal app pattern)
create policy if not exists "meeting_milestones_all" 
  on public.meeting_milestones 
  for all 
  to authenticated 
  using (true) 
  with check (true);

create policy if not exists "meeting_ongoing_notes_all" 
  on public.meeting_ongoing_notes 
  for all 
  to authenticated 
  using (true) 
  with check (true);

-- 2. Create priority management table (similar to statuses)
create table if not exists public.meeting_task_priorities (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  name text not null,
  position int not null default 1,
  color_hex text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_priorities_meeting 
  on public.meeting_task_priorities (meeting_id, position);

alter table public.meeting_task_priorities enable row level security;

create policy if not exists "meeting_task_priorities_all" 
  on public.meeting_task_priorities 
  for all 
  to authenticated 
  using (true) 
  with check (true);

-- 3. Add color_hex to meeting_attendees for canonical color management
alter table public.meeting_attendees 
  add column if not exists color_hex text;

-- Ensure full_name column exists (added in migration 004, this is a safety check)
-- This is idempotent and safe to run even if migration 004 was already applied
alter table public.meeting_attendees 
  add column if not exists full_name text;
