-- ============================================================
-- 027: Workspace Intelligence Layer
-- Embeddings, commitments, topics, lessons, schedule items,
-- ask history, daily digests
-- ============================================================

-- ============================================================
-- 1. embeddings
-- ============================================================

create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  source_type text not null check (source_type in (
    'email', 'email_attachment', 'meeting_transcript', 'meeting_note',
    'meeting_minutes', 'site_report', 'site_report_item', 'lesson',
    'commitment', 'schedule_item'
  )),
  source_id uuid not null,
  chunk_index int default 0,
  chunk_text text not null,
  embedding vector(1536) not null,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_embeddings_hnsw
  on public.embeddings using hnsw (embedding vector_cosine_ops);

create index if not exists idx_embeddings_user_source_type
  on public.embeddings (user_id, source_type);

create index if not exists idx_embeddings_account_project
  on public.embeddings (account_id, ai_project_id);

create unique index if not exists idx_embeddings_source_chunk_uniq
  on public.embeddings (source_type, source_id, chunk_index);

-- ============================================================
-- 2. commitments
-- ============================================================

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  source_type text not null check (source_type in ('email_sent', 'email_received', 'meeting')),
  source_id uuid not null,
  owner text not null check (owner in ('me', 'them')),
  counterparty_email text,
  counterparty_name text,
  description text not null,
  due_date date,
  status text default 'open' check (status in ('open', 'fulfilled', 'overdue', 'cancelled', 'snoozed')),
  snoozed_until date,
  fulfilled_at timestamptz,
  ai_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commitments_account_status_due
  on public.commitments (account_id, status, due_date);

create index if not exists idx_commitments_account_owner_status
  on public.commitments (account_id, owner, status);

-- ============================================================
-- 3. topics
-- ============================================================

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  name text not null,
  summary text,
  status text default 'active' check (status in ('active', 'resolved', 'archived')),
  first_seen_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_topics_account_status_activity
  on public.topics (account_id, status, last_activity_at desc);

-- ============================================================
-- 4. topic_items
-- ============================================================

create table if not exists public.topic_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('email', 'meeting', 'site_report', 'commitment', 'attachment')),
  item_id uuid not null,
  relevance_score numeric,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_topic_items_uniq
  on public.topic_items (topic_id, item_type, item_id);

create index if not exists idx_topic_items_topic
  on public.topic_items (topic_id);

-- ============================================================
-- 5. lessons_learned
-- ============================================================

create table if not exists public.lessons_learned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  title text not null,
  situation text,
  what_happened text,
  what_we_learned text,
  what_to_do_differently text,
  source_topic_id uuid references public.topics(id) on delete set null,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. schedule_items
-- ============================================================

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  title text not null,
  description text,
  milestone_date date,
  original_milestone_date date,
  status text default 'on_track' check (status in ('on_track', 'at_risk', 'slipped', 'completed', 'cancelled')),
  source_type text,
  source_id uuid,
  last_updated_from_source_at timestamptz,
  ai_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_items_account_project_date
  on public.schedule_items (account_id, ai_project_id, milestone_date);

create index if not exists idx_schedule_items_account_status
  on public.schedule_items (account_id, status);

-- ============================================================
-- 7. ask_queries
-- ============================================================

create table if not exists public.ask_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  query text not null,
  answer text,
  sources jsonb default '[]'::jsonb,
  scope text not null check (scope in ('current_workspace', 'all_workspaces')),
  model_used text,
  tokens_used int,
  created_at timestamptz not null default now()
);

create index if not exists idx_ask_queries_user_created
  on public.ask_queries (user_id, created_at desc);

-- ============================================================
-- 8. daily_digests
-- ============================================================

create table if not exists public.daily_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  digest_date date not null,
  content jsonb not null default '{}'::jsonb,
  sent_via_email boolean default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, digest_date)
);

-- ============================================================
-- 9. Row Level Security
-- ============================================================

alter table public.embeddings enable row level security;
alter table public.commitments enable row level security;
alter table public.topics enable row level security;
alter table public.topic_items enable row level security;
alter table public.lessons_learned enable row level security;
alter table public.schedule_items enable row level security;
alter table public.ask_queries enable row level security;
alter table public.daily_digests enable row level security;

-- embeddings
create policy embeddings_select on public.embeddings
  for select to authenticated using (user_id = (select auth.uid()));

create policy embeddings_insert on public.embeddings
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy embeddings_update on public.embeddings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy embeddings_delete on public.embeddings
  for delete to authenticated using (user_id = (select auth.uid()));

-- commitments
create policy commitments_select on public.commitments
  for select to authenticated using (user_id = (select auth.uid()));

create policy commitments_insert on public.commitments
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy commitments_update on public.commitments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy commitments_delete on public.commitments
  for delete to authenticated using (user_id = (select auth.uid()));

-- topics
create policy topics_select on public.topics
  for select to authenticated using (user_id = (select auth.uid()));

create policy topics_insert on public.topics
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy topics_update on public.topics
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy topics_delete on public.topics
  for delete to authenticated using (user_id = (select auth.uid()));

-- topic_items
create policy topic_items_select on public.topic_items
  for select to authenticated using (user_id = (select auth.uid()));

create policy topic_items_insert on public.topic_items
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy topic_items_update on public.topic_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy topic_items_delete on public.topic_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- lessons_learned
create policy lessons_learned_select on public.lessons_learned
  for select to authenticated using (user_id = (select auth.uid()));

create policy lessons_learned_insert on public.lessons_learned
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy lessons_learned_update on public.lessons_learned
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy lessons_learned_delete on public.lessons_learned
  for delete to authenticated using (user_id = (select auth.uid()));

-- schedule_items
create policy schedule_items_select on public.schedule_items
  for select to authenticated using (user_id = (select auth.uid()));

create policy schedule_items_insert on public.schedule_items
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy schedule_items_update on public.schedule_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy schedule_items_delete on public.schedule_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ask_queries
create policy ask_queries_select on public.ask_queries
  for select to authenticated using (user_id = (select auth.uid()));

create policy ask_queries_insert on public.ask_queries
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy ask_queries_update on public.ask_queries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ask_queries_delete on public.ask_queries
  for delete to authenticated using (user_id = (select auth.uid()));

-- daily_digests
create policy daily_digests_select on public.daily_digests
  for select to authenticated using (user_id = (select auth.uid()));

create policy daily_digests_insert on public.daily_digests
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy daily_digests_update on public.daily_digests
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy daily_digests_delete on public.daily_digests
  for delete to authenticated using (user_id = (select auth.uid()));

-- ============================================================
-- 10. updated_at triggers (reuse existing crm_set_updated_at)
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'commitments_set_updated_at') then
    create trigger commitments_set_updated_at
      before update on public.commitments
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'topics_set_updated_at') then
    create trigger topics_set_updated_at
      before update on public.topics
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'lessons_learned_set_updated_at') then
    create trigger lessons_learned_set_updated_at
      before update on public.lessons_learned
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'schedule_items_set_updated_at') then
    create trigger schedule_items_set_updated_at
      before update on public.schedule_items
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;
