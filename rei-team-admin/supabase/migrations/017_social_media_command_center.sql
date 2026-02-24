-- REI Social Media Command Center: schema, RLS, and seed data

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type public.team_role as enum ('creator', 'manager', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.platform_name as enum (
    'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'google_business'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_status as enum (
    'draft', 'pending_approval', 'approved', 'scheduled', 'published', 'rejected', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.schedule_type as enum ('one_time', 'recurring');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_type as enum ('none', 'image', 'video', 'carousel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.engagement_type as enum ('comment', 'dm', 'mention', 'review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sentiment_type as enum ('positive', 'neutral', 'negative');
exception when duplicate_object then null; end $$;

-- ============================================================
-- TABLES
-- ============================================================

-- team_members
create table if not exists public.team_members (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.team_role not null default 'creator',
  display_name text not null,
  email        text not null,
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- social_platforms
create table if not exists public.social_platforms (
  id               uuid primary key default gen_random_uuid(),
  platform_name    public.platform_name not null,
  account_name     text not null,
  account_id       text not null,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  is_connected     boolean not null default false,
  platform_url     text not null,
  metadata         jsonb,
  connected_by     uuid references public.team_members(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- brand_voices
create table if not exists public.brand_voices (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null,
  system_prompt   text not null,
  example_content text,
  is_default      boolean not null default false,
  created_by      uuid references public.team_members(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- content_types
create table if not exists public.content_types (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  description            text not null,
  default_brand_voice_id uuid references public.brand_voices(id) on delete set null,
  default_ai_model       text not null default 'gpt-4o',
  icon                   text,
  is_system              boolean not null default false,
  is_active              boolean not null default true,
  created_by             uuid references public.team_members(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- content_posts
create table if not exists public.content_posts (
  id                       uuid primary key default gen_random_uuid(),
  title                    text,
  body                     text not null,
  content_type_id          uuid references public.content_types(id) on delete set null,
  brand_voice_id           uuid references public.brand_voices(id) on delete set null,
  status                   public.post_status not null default 'draft',
  target_platforms         jsonb not null default '[]',
  media_urls               jsonb,
  media_type               public.media_type,
  ai_model_used            text,
  ai_prompt_used           text,
  platform_specific_content jsonb,
  created_by               uuid references public.team_members(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- content_schedules
create table if not exists public.content_schedules (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.content_posts(id) on delete cascade,
  schedule_type       public.schedule_type not null,
  scheduled_at        timestamptz,
  recurrence_rule     text,
  recurrence_end_date timestamptz,
  timezone            text not null default 'America/New_York',
  is_active           boolean not null default true,
  last_run_at         timestamptz,
  next_run_at         timestamptz,
  created_by          uuid references public.team_members(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- content_approvals
create table if not exists public.content_approvals (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.content_posts(id) on delete cascade,
  submitted_by uuid not null references public.team_members(id) on delete cascade,
  reviewed_by  uuid references public.team_members(id) on delete set null,
  status       public.approval_status not null default 'pending',
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz
);

-- analytics_snapshots
create table if not exists public.analytics_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  post_id                 uuid references public.content_posts(id) on delete set null,
  platform_id             uuid not null references public.social_platforms(id) on delete cascade,
  platform_post_id        text not null,
  impressions             integer not null default 0,
  reach                   integer not null default 0,
  likes                   integer not null default 0,
  comments_count          integer not null default 0,
  shares                  integer not null default 0,
  saves                   integer not null default 0,
  clicks                  integer not null default 0,
  engagement_rate         decimal,
  follower_count_at_time  integer,
  snapshot_date           date not null,
  raw_data                jsonb,
  created_at              timestamptz not null default now()
);

-- engagement_inbox
create table if not exists public.engagement_inbox (
  id                  uuid primary key default gen_random_uuid(),
  platform_id         uuid not null references public.social_platforms(id) on delete cascade,
  platform_item_id    text not null,
  type                public.engagement_type not null,
  author_name         text not null,
  author_avatar_url   text,
  author_platform_id  text not null,
  content             text not null,
  parent_post_id      uuid references public.content_posts(id) on delete set null,
  sentiment           public.sentiment_type,
  is_read             boolean not null default false,
  is_replied          boolean not null default false,
  created_at          timestamptz not null default now(),
  received_at         timestamptz not null default now()
);

-- engagement_replies
create table if not exists public.engagement_replies (
  id               uuid primary key default gen_random_uuid(),
  inbox_item_id    uuid not null references public.engagement_inbox(id) on delete cascade,
  reply_content    text not null,
  is_ai_generated  boolean not null default false,
  ai_model_used    text,
  sent_by          uuid not null references public.team_members(id) on delete cascade,
  sent_at          timestamptz not null default now(),
  platform_reply_id text
);

-- ai_generation_history
create table if not exists public.ai_generation_history (
  id            uuid primary key default gen_random_uuid(),
  prompt        text not null,
  response      text not null,
  model_used    text not null,
  content_type  text,
  tokens_used   integer,
  cost_estimate decimal,
  generated_by  uuid not null references public.team_members(id) on delete cascade,
  post_id       uuid references public.content_posts(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- newsletter_sources
create table if not exists public.newsletter_sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  url        text not null,
  is_active  boolean not null default true,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- HELPER FUNCTION: get current user's team role
-- ============================================================

create or replace function public.current_member_role()
returns public.team_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.team_members
  where user_id = (select auth.uid())
  and is_active = true
  limit 1;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.team_members         enable row level security;
alter table public.social_platforms     enable row level security;
alter table public.brand_voices         enable row level security;
alter table public.content_types        enable row level security;
alter table public.content_posts        enable row level security;
alter table public.content_schedules    enable row level security;
alter table public.content_approvals    enable row level security;
alter table public.analytics_snapshots  enable row level security;
alter table public.engagement_inbox     enable row level security;
alter table public.engagement_replies   enable row level security;
alter table public.ai_generation_history enable row level security;
alter table public.newsletter_sources   enable row level security;

-- Drop existing policies (idempotent)
drop policy if exists sm_team_members_select   on public.team_members;
drop policy if exists sm_team_members_insert   on public.team_members;
drop policy if exists sm_team_members_update   on public.team_members;
drop policy if exists sm_team_members_delete   on public.team_members;

drop policy if exists sm_social_platforms_select on public.social_platforms;
drop policy if exists sm_social_platforms_insert on public.social_platforms;
drop policy if exists sm_social_platforms_update on public.social_platforms;
drop policy if exists sm_social_platforms_delete on public.social_platforms;

drop policy if exists sm_brand_voices_select on public.brand_voices;
drop policy if exists sm_brand_voices_insert on public.brand_voices;
drop policy if exists sm_brand_voices_update on public.brand_voices;
drop policy if exists sm_brand_voices_delete on public.brand_voices;

drop policy if exists sm_content_types_select on public.content_types;
drop policy if exists sm_content_types_insert on public.content_types;
drop policy if exists sm_content_types_update on public.content_types;
drop policy if exists sm_content_types_delete on public.content_types;

drop policy if exists sm_content_posts_select on public.content_posts;
drop policy if exists sm_content_posts_insert on public.content_posts;
drop policy if exists sm_content_posts_update on public.content_posts;
drop policy if exists sm_content_posts_delete on public.content_posts;

drop policy if exists sm_content_schedules_select on public.content_schedules;
drop policy if exists sm_content_schedules_insert on public.content_schedules;
drop policy if exists sm_content_schedules_update on public.content_schedules;
drop policy if exists sm_content_schedules_delete on public.content_schedules;

drop policy if exists sm_content_approvals_select on public.content_approvals;
drop policy if exists sm_content_approvals_insert on public.content_approvals;
drop policy if exists sm_content_approvals_update on public.content_approvals;

drop policy if exists sm_analytics_snapshots_select on public.analytics_snapshots;
drop policy if exists sm_analytics_snapshots_insert on public.analytics_snapshots;
drop policy if exists sm_analytics_snapshots_update on public.analytics_snapshots;

drop policy if exists sm_engagement_inbox_select on public.engagement_inbox;
drop policy if exists sm_engagement_inbox_insert on public.engagement_inbox;
drop policy if exists sm_engagement_inbox_update on public.engagement_inbox;

drop policy if exists sm_engagement_replies_select on public.engagement_replies;
drop policy if exists sm_engagement_replies_insert on public.engagement_replies;

drop policy if exists sm_ai_history_select on public.ai_generation_history;
drop policy if exists sm_ai_history_insert on public.ai_generation_history;

drop policy if exists sm_newsletter_sources_select on public.newsletter_sources;
drop policy if exists sm_newsletter_sources_insert on public.newsletter_sources;
drop policy if exists sm_newsletter_sources_update on public.newsletter_sources;
drop policy if exists sm_newsletter_sources_delete on public.newsletter_sources;

-- ---- team_members ----
-- All authenticated users can read team members
create policy "sm_team_members_select"
on public.team_members for select
to authenticated
using (true);

-- Only admins can insert/delete; members can update their own record
create policy "sm_team_members_insert"
on public.team_members for insert
to authenticated
with check (public.current_member_role() = 'admin');

create policy "sm_team_members_update"
on public.team_members for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.current_member_role() = 'admin'
)
with check (
  user_id = (select auth.uid())
  or public.current_member_role() = 'admin'
);

create policy "sm_team_members_delete"
on public.team_members for delete
to authenticated
using (public.current_member_role() = 'admin');

-- ---- social_platforms (admin only for write) ----
create policy "sm_social_platforms_select"
on public.social_platforms for select
to authenticated
using (true);

create policy "sm_social_platforms_insert"
on public.social_platforms for insert
to authenticated
with check (public.current_member_role() = 'admin');

create policy "sm_social_platforms_update"
on public.social_platforms for update
to authenticated
using (public.current_member_role() = 'admin')
with check (public.current_member_role() = 'admin');

create policy "sm_social_platforms_delete"
on public.social_platforms for delete
to authenticated
using (public.current_member_role() = 'admin');

-- ---- brand_voices ----
create policy "sm_brand_voices_select"
on public.brand_voices for select
to authenticated
using (true);

create policy "sm_brand_voices_insert"
on public.brand_voices for insert
to authenticated
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_brand_voices_update"
on public.brand_voices for update
to authenticated
using (public.current_member_role() in ('manager', 'admin'))
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_brand_voices_delete"
on public.brand_voices for delete
to authenticated
using (public.current_member_role() = 'admin');

-- ---- content_types ----
create policy "sm_content_types_select"
on public.content_types for select
to authenticated
using (true);

create policy "sm_content_types_insert"
on public.content_types for insert
to authenticated
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_content_types_update"
on public.content_types for update
to authenticated
using (public.current_member_role() in ('manager', 'admin'))
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_content_types_delete"
on public.content_types for delete
to authenticated
using (public.current_member_role() = 'admin');

-- ---- content_posts ----
create policy "sm_content_posts_select"
on public.content_posts for select
to authenticated
using (true);

-- Creators can insert their own posts
create policy "sm_content_posts_insert"
on public.content_posts for insert
to authenticated
with check (
  exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and is_active = true
  )
);

-- Creators update their own drafts; managers/admins can update any post
create policy "sm_content_posts_update"
on public.content_posts for update
to authenticated
using (
  (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
        and is_active = true
        and id = content_posts.created_by
    )
    and status = 'draft'
  )
  or public.current_member_role() in ('manager', 'admin')
)
with check (
  (
    exists (
      select 1 from public.team_members
      where user_id = (select auth.uid())
        and is_active = true
        and id = content_posts.created_by
    )
    and status = 'draft'
  )
  or public.current_member_role() in ('manager', 'admin')
);

create policy "sm_content_posts_delete"
on public.content_posts for delete
to authenticated
using (public.current_member_role() in ('manager', 'admin'));

-- ---- content_schedules ----
create policy "sm_content_schedules_select"
on public.content_schedules for select
to authenticated
using (true);

create policy "sm_content_schedules_insert"
on public.content_schedules for insert
to authenticated
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_content_schedules_update"
on public.content_schedules for update
to authenticated
using (public.current_member_role() in ('manager', 'admin'))
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_content_schedules_delete"
on public.content_schedules for delete
to authenticated
using (public.current_member_role() in ('manager', 'admin'));

-- ---- content_approvals ----
create policy "sm_content_approvals_select"
on public.content_approvals for select
to authenticated
using (true);

-- Anyone with an active membership can submit for approval
create policy "sm_content_approvals_insert"
on public.content_approvals for insert
to authenticated
with check (
  exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and is_active = true
  )
);

-- Managers/admins can review (update) approvals
create policy "sm_content_approvals_update"
on public.content_approvals for update
to authenticated
using (public.current_member_role() in ('manager', 'admin'))
with check (public.current_member_role() in ('manager', 'admin'));

-- ---- analytics_snapshots ----
create policy "sm_analytics_snapshots_select"
on public.analytics_snapshots for select
to authenticated
using (true);

create policy "sm_analytics_snapshots_insert"
on public.analytics_snapshots for insert
to authenticated
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_analytics_snapshots_update"
on public.analytics_snapshots for update
to authenticated
using (public.current_member_role() in ('manager', 'admin'))
with check (public.current_member_role() in ('manager', 'admin'));

-- ---- engagement_inbox ----
create policy "sm_engagement_inbox_select"
on public.engagement_inbox for select
to authenticated
using (true);

create policy "sm_engagement_inbox_insert"
on public.engagement_inbox for insert
to authenticated
with check (public.current_member_role() in ('manager', 'admin'));

-- Mark as read/replied — any team member
create policy "sm_engagement_inbox_update"
on public.engagement_inbox for update
to authenticated
using (
  exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and is_active = true
  )
)
with check (
  exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and is_active = true
  )
);

-- ---- engagement_replies ----
create policy "sm_engagement_replies_select"
on public.engagement_replies for select
to authenticated
using (true);

create policy "sm_engagement_replies_insert"
on public.engagement_replies for insert
to authenticated
with check (
  exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and is_active = true
  )
);

-- ---- ai_generation_history ----
create policy "sm_ai_history_select"
on public.ai_generation_history for select
to authenticated
using (true);

create policy "sm_ai_history_insert"
on public.ai_generation_history for insert
to authenticated
with check (
  exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and is_active = true
  )
);

-- ---- newsletter_sources ----
create policy "sm_newsletter_sources_select"
on public.newsletter_sources for select
to authenticated
using (true);

create policy "sm_newsletter_sources_insert"
on public.newsletter_sources for insert
to authenticated
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_newsletter_sources_update"
on public.newsletter_sources for update
to authenticated
using (public.current_member_role() in ('manager', 'admin'))
with check (public.current_member_role() in ('manager', 'admin'));

create policy "sm_newsletter_sources_delete"
on public.newsletter_sources for delete
to authenticated
using (public.current_member_role() = 'admin');

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default brand voices (no created_by since no team members exist yet)
insert into public.brand_voices (name, description, system_prompt, is_default)
select name, description, system_prompt, is_default
from (values
  (
    'Educational',
    'Clear, informative posts that teach real estate concepts and tips',
    'You are a knowledgeable real estate educator. Write clear, informative content that teaches readers valuable concepts and tips. Use simple language, explain jargon, and always provide actionable takeaways. Tone is authoritative yet approachable.',
    true
  ),
  (
    'Casual & Friendly',
    'Warm, conversational posts that build community and relatability',
    'You are a friendly real estate professional writing for social media. Use a warm, conversational tone. Be relatable, use emojis sparingly, and write as if talking to a friend. Keep sentences short and engaging.',
    false
  ),
  (
    'Professional',
    'Polished, credibility-focused posts for a professional audience',
    'You are a seasoned real estate professional. Write polished, professional content that demonstrates expertise and builds credibility. Use industry terminology appropriately, maintain a formal but not stiff tone, and focus on value and results.',
    false
  ),
  (
    'Promotional',
    'Persuasive posts designed to drive leads and conversions',
    'You are a real estate marketing copywriter. Write compelling, persuasive content that drives action. Include clear calls-to-action, highlight benefits over features, create urgency when appropriate, and focus on the reader''s desires and pain points.',
    false
  ),
  (
    'Storytelling',
    'Narrative-driven posts that connect emotionally with the audience',
    'You are a real estate storyteller. Write narrative-driven content that emotionally connects with readers. Share client journeys, behind-the-scenes moments, and authentic experiences. Use vivid details and build a narrative arc that resonates.',
    false
  )
) as v(name, description, system_prompt, is_default)
where not exists (select 1 from public.brand_voices limit 1);

-- Default content types
insert into public.content_types (name, description, icon, is_system)
select name, description, icon, is_system
from (values
  ('Daily Tips',              'Quick, practical real estate tips for daily posting',                '💡', true),
  ('Weekly Newsletter',       'In-depth weekly content updates for subscribers',                   '📰', true),
  ('Mythbusters Segments',    'Debunking common real estate myths and misconceptions',              '🔍', true),
  ('Market Updates',          'Local and national real estate market news and analysis',            '📊', true),
  ('Testimonials & Success Stories', 'Client success stories and testimonials',                    '⭐', true),
  ('Holiday & Seasonal',      'Holiday greetings and seasonal real estate content',                '🎉', true),
  ('CTA Posts',               'Direct call-to-action posts driving leads and conversions',         '🎯', true)
) as v(name, description, icon, is_system)
where not exists (select 1 from public.content_types limit 1);

-- Default social platforms (all disconnected)
insert into public.social_platforms (platform_name, account_name, account_id, access_token, is_connected, platform_url)
select platform_name::public.platform_name, account_name, account_id, access_token, is_connected, platform_url
from (values
  ('instagram',        'Instagram',             'not_connected', '', false, 'https://instagram.com'),
  ('facebook',         'Facebook',              'not_connected', '', false, 'https://facebook.com'),
  ('linkedin',         'LinkedIn',              'not_connected', '', false, 'https://linkedin.com'),
  ('tiktok',           'TikTok',                'not_connected', '', false, 'https://tiktok.com'),
  ('youtube',          'YouTube',               'not_connected', '', false, 'https://youtube.com'),
  ('google_business',  'Google Business Profile','not_connected', '', false, 'https://business.google.com')
) as v(platform_name, account_name, account_id, access_token, is_connected, platform_url)
where not exists (select 1 from public.social_platforms limit 1);
