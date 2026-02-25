-- Migration: notifications table for approval workflow
-- Phase 2 PR 6: Approval Workflow

create type if not exists public.notification_type as enum (
  'approval_requested',
  'approval_approved',
  'approval_rejected'
);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.team_members(id) on delete cascade,
  actor_id     uuid references public.team_members(id) on delete set null,
  post_id      uuid references public.content_posts(id) on delete cascade,
  type         public.notification_type not null,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

-- Recipients can read their own notifications
create policy "notifications_select"
on public.notifications for select
to authenticated
using (recipient_id = (
  select id from public.team_members where user_id = auth.uid() and is_active = true limit 1
));

-- Anyone authenticated can insert notifications (the API route handles permission logic)
create policy "notifications_insert"
on public.notifications for insert
to authenticated
with check (true);

-- Recipients can mark their own notifications as read
create policy "notifications_update"
on public.notifications for update
to authenticated
using (recipient_id = (
  select id from public.team_members where user_id = auth.uid() and is_active = true limit 1
))
with check (recipient_id = (
  select id from public.team_members where user_id = auth.uid() and is_active = true limit 1
));
