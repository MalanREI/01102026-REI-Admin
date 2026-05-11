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
    check (user_state is null or user_state in ('handled', 'followup'));

create index if not exists idx_emails_user_state
  on public.emails (account_id, user_state)
  where user_state is not null;

-- ============================================================
-- 5. Add index on emails.folder_id for server-side filtering
-- ============================================================

create index if not exists idx_emails_folder_id
  on public.emails (account_id, folder_id);
