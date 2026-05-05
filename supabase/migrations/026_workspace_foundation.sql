-- ============================================================
-- 026: Workspace Module Foundation
-- Email ingestion, attachments, AI-detected projects, triage
-- ============================================================

-- 1. Enable pgvector
create extension if not exists vector;

-- ============================================================
-- 2. connected_accounts (each row IS a workspace)
-- ============================================================

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  email_address text not null,
  display_name text not null,
  color_hex text default '#6366f1',
  sidebar_position int default 0,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  scopes text[],
  is_active boolean default true,
  last_synced_at timestamptz,
  sync_status text default 'idle' check (sync_status in ('idle', 'syncing', 'error')),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email_address)
);

create index if not exists idx_connected_accounts_user_position
  on public.connected_accounts (user_id, sidebar_position);

-- ============================================================
-- 3. ai_detected_projects
-- ============================================================

create table if not exists public.ai_detected_projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  keywords text[],
  first_seen_at timestamptz,
  last_activity_at timestamptz,
  status text default 'active' check (status in ('active', 'completed', 'archived')),
  is_user_confirmed boolean default false,
  color_hex text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_detected_projects_account_status
  on public.ai_detected_projects (account_id, status);

-- ============================================================
-- 4. emails
-- ============================================================

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  provider_message_id text not null,
  thread_id text,
  subject text,
  from_address text,
  from_name text,
  to_addresses jsonb,
  cc_addresses jsonb,
  bcc_addresses jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  body_text text,
  body_html text,
  snippet text,
  is_sent_by_me boolean default false,
  is_read boolean default false,
  is_starred boolean default false,
  has_attachments boolean default false,
  is_promotional boolean default false,
  list_unsubscribe_header text,
  triage_category text check (triage_category is null or triage_category in
    ('fyi', 'needs_response', 'action_required', 'decision_needed', 'cc_only')),
  triage_confidence numeric,
  raw_headers jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_message_id)
);

create index if not exists idx_emails_user
  on public.emails (user_id);

create index if not exists idx_emails_account_sent
  on public.emails (account_id, sent_at desc);

create index if not exists idx_emails_account_thread
  on public.emails (account_id, thread_id);

create index if not exists idx_emails_ai_project
  on public.emails (ai_project_id);

create index if not exists idx_emails_from_address
  on public.emails (from_address);

create index if not exists idx_emails_account_triage
  on public.emails (account_id, triage_category)
  where triage_category is not null;

create index if not exists idx_emails_account_promotional
  on public.emails (account_id, is_promotional)
  where is_promotional = true;

-- ============================================================
-- 5. email_attachments
-- ============================================================

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  file_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  extracted_text text,
  extraction_status text default 'pending' check (extraction_status in
    ('pending', 'extracted', 'failed', 'skipped')),
  extraction_error text,
  ai_document_type text,
  ai_contractor text,
  ai_project_id uuid references public.ai_detected_projects(id) on delete set null,
  ai_tags text[],
  ai_classification_status text default 'pending' check
    (ai_classification_status in ('pending', 'classified', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_attachments_account_project
  on public.email_attachments (account_id, ai_project_id);

create index if not exists idx_email_attachments_account_doctype
  on public.email_attachments (account_id, ai_document_type);

create index if not exists idx_email_attachments_email
  on public.email_attachments (email_id);

-- ============================================================
-- 6. unsubscribe_actions
-- ============================================================

create table if not exists public.unsubscribe_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  sender_email text not null,
  sender_domain text,
  method text check (method in ('list_unsubscribe_http', 'list_unsubscribe_mailto', 'ai_found_link', 'manual')),
  status text default 'pending' check (status in ('pending', 'success', 'failed', 'skipped')),
  executed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (account_id, sender_email)
);

-- ============================================================
-- 7. Row Level Security
-- ============================================================

alter table public.connected_accounts enable row level security;
alter table public.ai_detected_projects enable row level security;
alter table public.emails enable row level security;
alter table public.email_attachments enable row level security;
alter table public.unsubscribe_actions enable row level security;

-- connected_accounts
create policy connected_accounts_select on public.connected_accounts
  for select to authenticated using (user_id = (select auth.uid()));

create policy connected_accounts_insert on public.connected_accounts
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy connected_accounts_update on public.connected_accounts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy connected_accounts_delete on public.connected_accounts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ai_detected_projects
create policy ai_detected_projects_select on public.ai_detected_projects
  for select to authenticated using (user_id = (select auth.uid()));

create policy ai_detected_projects_insert on public.ai_detected_projects
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy ai_detected_projects_update on public.ai_detected_projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ai_detected_projects_delete on public.ai_detected_projects
  for delete to authenticated using (user_id = (select auth.uid()));

-- emails
create policy emails_select on public.emails
  for select to authenticated using (user_id = (select auth.uid()));

create policy emails_insert on public.emails
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy emails_update on public.emails
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy emails_delete on public.emails
  for delete to authenticated using (user_id = (select auth.uid()));

-- email_attachments
create policy email_attachments_select on public.email_attachments
  for select to authenticated using (user_id = (select auth.uid()));

create policy email_attachments_insert on public.email_attachments
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy email_attachments_update on public.email_attachments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy email_attachments_delete on public.email_attachments
  for delete to authenticated using (user_id = (select auth.uid()));

-- unsubscribe_actions
create policy unsubscribe_actions_select on public.unsubscribe_actions
  for select to authenticated using (user_id = (select auth.uid()));

create policy unsubscribe_actions_insert on public.unsubscribe_actions
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy unsubscribe_actions_update on public.unsubscribe_actions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy unsubscribe_actions_delete on public.unsubscribe_actions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ============================================================
-- 8. updated_at triggers (reuse existing crm_set_updated_at)
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'connected_accounts_set_updated_at') then
    create trigger connected_accounts_set_updated_at
      before update on public.connected_accounts
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'ai_detected_projects_set_updated_at') then
    create trigger ai_detected_projects_set_updated_at
      before update on public.ai_detected_projects
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'emails_set_updated_at') then
    create trigger emails_set_updated_at
      before update on public.emails
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'email_attachments_set_updated_at') then
    create trigger email_attachments_set_updated_at
      before update on public.email_attachments
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;
