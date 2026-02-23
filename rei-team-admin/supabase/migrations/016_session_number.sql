-- Add session_number column to track the real session sequence
alter table public.meeting_minutes_sessions
  add column if not exists session_number int;
