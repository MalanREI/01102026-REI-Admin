-- ============================================================
-- 033: Phase 5 — Email parity layer
-- Folders, conversations, drafts, signatures, user_state
-- ============================================================

-- ============================================================
-- 1. email_folders
-- ============================================================

create table if not exists public.email_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider_folder_id text not null,
  well_known_name text,
  display_name text not null,
  parent_folder_id uuid references public.email_folders(id) on delete cascade,
  unread_count int not null default 0,
  total_count int not null default 0,
  is_hidden boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_folder_id)
);

create index if not exists idx_email_folders_account
  on public.email_folders (account_id, position);
create index if not exists idx_email_folders_well_known
  on public.email_folders (account_id, well_known_name);

alter table public.email_folders enable row level security;

create policy email_folders_select on public.email_folders
  for select to authenticated using (user_id = (select auth.uid()));
create policy email_folders_insert on public.email_folders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy email_folders_update on public.email_folders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy email_folders_delete on public.email_folders
  for delete to authenticated using (user_id = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'email_folders_set_updated_at') then
    create trigger email_folders_set_updated_at
      before update on public.email_folders
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

-- ============================================================
-- 2. email_signatures
-- ============================================================

create table if not exists public.email_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  name text not null,
  body_html text not null,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_signatures_account
  on public.email_signatures (account_id, position);

alter table public.email_signatures enable row level security;

create policy email_signatures_select on public.email_signatures
  for select to authenticated using (user_id = (select auth.uid()));
create policy email_signatures_insert on public.email_signatures
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy email_signatures_update on public.email_signatures
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy email_signatures_delete on public.email_signatures
  for delete to authenticated using (user_id = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'email_signatures_set_updated_at') then
    create trigger email_signatures_set_updated_at
      before update on public.email_signatures
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

-- ============================================================
-- 3. email_drafts (auto-saved compose state)
-- ============================================================

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  mode text not null default 'compose' check (mode in ('compose', 'reply', 'replyAll', 'forward')),
  in_reply_to_message_id text,
  to_addresses text[] default '{}',
  cc_addresses text[] default '{}',
  bcc_addresses text[] default '{}',
  subject text default '',
  body_html text default '',
  signature_id uuid references public.email_signatures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_drafts_account
  on public.email_drafts (account_id, updated_at desc);

alter table public.email_drafts enable row level security;

create policy email_drafts_select on public.email_drafts
  for select to authenticated using (user_id = (select auth.uid()));
create policy email_drafts_insert on public.email_drafts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy email_drafts_update on public.email_drafts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy email_drafts_delete on public.email_drafts
  for delete to authenticated using (user_id = (select auth.uid()));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'email_drafts_set_updated_at') then
    create trigger email_drafts_set_updated_at
      before update on public.email_drafts
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

-- ============================================================
-- 4. Add user_state to emails (manual triage: handled / followup)
-- ============================================================

alter table public.emails
  add column if not exists user_state text
    check (user_state is null or user_state in ('inbox', 'handled', 'followup', 'snoozed'));

create index if not exists idx_emails_user_state
  on public.emails (account_id, user_state)
  where user_state is not null;

-- ============================================================
-- 5. Add index on emails.folder_id for server-side filtering
-- ============================================================

create index if not exists idx_emails_folder_id
  on public.emails (account_id, folder_id);

-- ============================================================
-- 6. Extended user state columns on emails
-- ============================================================

alter table public.emails add column if not exists handled_at timestamptz;
alter table public.emails add column if not exists followup_due_at timestamptz;
alter table public.emails add column if not exists snoozed_until timestamptz;
alter table public.emails add column if not exists user_notes text;
alter table public.emails add column if not exists conversation_id uuid;

-- Backfill: emails default to 'inbox' if unread, 'handled' if read
update public.emails set user_state = case
  when is_read = true then 'handled' else 'inbox'
end where user_state is null;

create index if not exists idx_emails_followup_due
  on public.emails (account_id, followup_due_at)
  where user_state = 'followup' and followup_due_at is not null;

create index if not exists idx_emails_snoozed_until
  on public.emails (account_id, snoozed_until)
  where snoozed_until is not null;

-- ============================================================
-- 7. Conversations table for threading
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider_thread_id text not null,
  subject text,
  message_count integer not null default 0,
  unread_count integer not null default 0,
  last_message_at timestamptz,
  first_message_at timestamptz,
  participants jsonb default '[]'::jsonb,
  has_starred boolean not null default false,
  has_attachments boolean not null default false,
  primary_folder_id text,
  user_state text,
  handled_at timestamptz,
  followup_due_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_thread_id)
);

do $$ begin
  alter table public.conversations add constraint conversations_user_state_check
    check (user_state in ('inbox', 'handled', 'followup', 'snoozed') or user_state is null);
exception when duplicate_object then null;
end $$;

create index if not exists idx_conversations_account_lastmsg
  on public.conversations (account_id, last_message_at desc);
create index if not exists idx_conversations_account_folder_lastmsg
  on public.conversations (account_id, primary_folder_id, last_message_at desc)
  where primary_folder_id is not null;
create index if not exists idx_conversations_account_userstate
  on public.conversations (account_id, user_state, last_message_at desc)
  where user_state is not null;

alter table public.conversations enable row level security;

do $$ begin
  create policy conversations_select on public.conversations
    for select to authenticated using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy conversations_insert on public.conversations
    for insert to authenticated with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy conversations_update on public.conversations
    for update to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy conversations_delete on public.conversations
    for delete to authenticated using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger conversations_set_updated_at
    before update on public.conversations
    for each row execute function public.crm_set_updated_at();
exception when duplicate_object then null;
end $$;

-- FK on emails.conversation_id
do $$ begin
  alter table public.emails add constraint emails_conversation_id_fkey
    foreign key (conversation_id) references public.conversations(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists idx_emails_conversation
  on public.emails (conversation_id, sent_at asc)
  where conversation_id is not null;

-- ============================================================
-- 8. Draft attachments table
-- ============================================================

create table if not exists public.draft_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references public.email_drafts(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_draft_attachments_draft
  on public.draft_attachments (draft_id);

alter table public.draft_attachments enable row level security;

do $$ begin
  create policy draft_attachments_select on public.draft_attachments
    for select to authenticated using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy draft_attachments_insert on public.draft_attachments
    for insert to authenticated with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy draft_attachments_update on public.draft_attachments
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy draft_attachments_delete on public.draft_attachments
    for delete to authenticated using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

alter table public.email_drafts add column if not exists attachment_count integer not null default 0;
