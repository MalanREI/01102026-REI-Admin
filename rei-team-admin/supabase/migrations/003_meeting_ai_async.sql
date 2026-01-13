-- Async AI minutes processing support (Option B)
--
-- Adds status columns on meeting_minutes_sessions so a Supabase DB Webhook can
-- trigger a Supabase Edge Function, which will:
--   - transcribe the recording
--   - map notes into agenda topics
--   - generate the minutes PDF
--   - email attendees
--
-- Safe to run multiple times.

alter table if exists public.meeting_minutes_sessions
  add column if not exists transcript text,
  add column if not exists pdf_path text,
  add column if not exists reference_link text,
  add column if not exists ai_status text default 'pending',
  add column if not exists ai_error text,
  add column if not exists ai_processed_at timestamptz;

-- Optional: index for faster polling / filtering
create index if not exists idx_minutes_sessions_ai_status on public.meeting_minutes_sessions (ai_status, meeting_id, started_at desc);
