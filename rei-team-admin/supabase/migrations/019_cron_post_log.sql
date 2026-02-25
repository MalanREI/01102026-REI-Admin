-- Migration 019: Cron post log table + extend notification_type for auto-posting
-- Phase 2 PR 7: Auto-Posting & Cron Engine

-- Extend notification_type enum with posting outcomes
alter type public.notification_type add value if not exists 'post_published';
alter type public.notification_type add value if not exists 'post_failed';

-- ─── cron_post_log ─────────────────────────────────────────────────────────
-- Tracks every posting attempt made by the cron engine.
create table if not exists public.cron_post_log (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid references public.content_schedules(id) on delete set null,
  post_id       uuid references public.content_posts(id) on delete set null,
  platform      text not null,
  status        text not null check (status in ('success', 'failed', 'skipped')),
  platform_post_id text,          -- external ID returned by the platform API on success
  error_message text,             -- error detail on failure
  attempted_at  timestamptz not null default now()
);

create index if not exists cron_post_log_post_idx      on public.cron_post_log(post_id, attempted_at desc);
create index if not exists cron_post_log_schedule_idx  on public.cron_post_log(schedule_id, attempted_at desc);
create index if not exists cron_post_log_status_idx    on public.cron_post_log(status, attempted_at desc);

alter table public.cron_post_log enable row level security;

-- Authenticated users can read logs
create policy "cron_post_log_select"
on public.cron_post_log for select
to authenticated
using (true);

-- Only service-role inserts (cron runs with SUPABASE_SERVICE_ROLE_KEY)
-- No INSERT policy for authenticated role; the cron API uses the admin client.
