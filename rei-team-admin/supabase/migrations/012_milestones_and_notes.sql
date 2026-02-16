-- Add Milestones and Ongoing Notes tables for meetings

-- Milestones: track important dates and goals for a meeting
create table if not exists public.meeting_milestones (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  status text not null default 'Pending', -- Pending, In Progress, Completed, Delayed
  priority text not null default 'Normal', -- Urgent, High, Normal, Low
  owner_id uuid references auth.users(id) on delete set null,
  owner_email text,
  owner_name text,
  position int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_milestones_meeting on public.meeting_milestones (meeting_id, position);
create index if not exists idx_milestones_target_date on public.meeting_milestones (target_date);

-- Ongoing Notes: persistent notes separate from tasks
create table if not exists public.meeting_ongoing_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  title text not null,
  content text,
  category text, -- optional category/tag
  position int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ongoing_notes_meeting on public.meeting_ongoing_notes (meeting_id, position);
