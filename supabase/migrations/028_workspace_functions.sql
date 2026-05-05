-- ============================================================
-- 028: Workspace Helper Functions
-- RPC functions called from the Next.js app layer
-- All SECURITY DEFINER with explicit ownership checks
-- ============================================================

-- ============================================================
-- 1. match_workspace_embeddings
-- Semantic search over user's embedding vectors
-- ============================================================

create or replace function public.match_workspace_embeddings(
  query_embedding vector(1536),
  filter_user_id uuid,
  match_count int default 10,
  filter_account_id uuid default null,
  filter_ai_project_id uuid default null,
  filter_source_types text[] default null,
  similarity_threshold float default 0.65
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  chunk_text text,
  similarity float,
  account_id uuid,
  ai_project_id uuid,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) != filter_user_id then
    raise exception 'Unauthorized';
  end if;

  return query
    select
      e.id,
      e.source_type,
      e.source_id,
      e.chunk_text,
      (1 - (e.embedding <=> query_embedding))::float as similarity,
      e.account_id,
      e.ai_project_id,
      e.metadata
    from public.embeddings e
    where e.user_id = filter_user_id
      and (filter_account_id is null or e.account_id = filter_account_id)
      and (filter_ai_project_id is null or e.ai_project_id = filter_ai_project_id)
      and (filter_source_types is null or e.source_type = any(filter_source_types))
      and (1 - (e.embedding <=> query_embedding)) >= similarity_threshold
    order by e.embedding <=> query_embedding asc
    limit match_count;
end;
$$;

grant execute on function public.match_workspace_embeddings to authenticated;

-- ============================================================
-- 2. get_full_email_context
-- Returns email + concatenated attachment text as jsonb
-- ============================================================

create or replace function public.get_full_email_context(p_email_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email record;
  v_attachments_text text;
  v_result jsonb;
begin
  select * into v_email
  from public.emails
  where id = p_email_id;

  if not found then
    raise exception 'Email not found';
  end if;

  if v_email.user_id != (select auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select string_agg(
    E'\n\n--- ATTACHMENT: ' || coalesce(ea.file_name, 'unnamed') || E' ---\n\n' || coalesce(ea.extracted_text, ''),
    ''
  ) into v_attachments_text
  from public.email_attachments ea
  where ea.email_id = p_email_id
    and ea.extracted_text is not null;

  v_result := jsonb_build_object(
    'id', v_email.id,
    'subject', v_email.subject,
    'from_address', v_email.from_address,
    'from_name', v_email.from_name,
    'to_addresses', v_email.to_addresses,
    'sent_at', v_email.sent_at,
    'received_at', v_email.received_at,
    'body_text', v_email.body_text,
    'snippet', v_email.snippet,
    'has_attachments', v_email.has_attachments,
    'triage_category', v_email.triage_category,
    'ai_project_id', v_email.ai_project_id,
    'attachments_text', v_attachments_text
  );

  return v_result;
end;
$$;

grant execute on function public.get_full_email_context to authenticated;

-- ============================================================
-- 3. get_workspace_stats
-- Dashboard stats for a single workspace/account
-- ============================================================

create or replace function public.get_workspace_stats(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
  v_result jsonb;
begin
  select * into v_account
  from public.connected_accounts
  where id = p_account_id;

  if not found then
    raise exception 'Account not found';
  end if;

  if v_account.user_id != (select auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select jsonb_build_object(
    'total_emails', (select count(*) from public.emails where account_id = p_account_id),
    'unread_count', (select count(*) from public.emails where account_id = p_account_id and is_read = false),
    'needs_response_count', (select count(*) from public.emails where account_id = p_account_id and triage_category = 'needs_response'),
    'action_required_count', (select count(*) from public.emails where account_id = p_account_id and triage_category = 'action_required'),
    'decision_needed_count', (select count(*) from public.emails where account_id = p_account_id and triage_category = 'decision_needed'),
    'open_commitments_count', (select count(*) from public.commitments where account_id = p_account_id and status = 'open' and owner = 'me'),
    'overdue_commitments_count', (select count(*) from public.commitments where account_id = p_account_id and status = 'open' and owner = 'me' and due_date < current_date),
    'active_projects_count', (select count(*) from public.ai_detected_projects where account_id = p_account_id and status = 'active'),
    'active_topics_count', (select count(*) from public.topics where account_id = p_account_id and status = 'active'),
    'last_synced_at', v_account.last_synced_at,
    'sync_status', v_account.sync_status
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_workspace_stats to authenticated;

-- ============================================================
-- 4. get_or_create_ai_project
-- Upsert AI-detected project by name (case-insensitive match)
-- ============================================================

create or replace function public.get_or_create_ai_project(
  p_account_id uuid,
  p_name text,
  p_keywords text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_user_id uuid;
  v_project_id uuid;
  v_existing_keywords text[];
begin
  select user_id into v_account_user_id
  from public.connected_accounts
  where id = p_account_id;

  if not found then
    raise exception 'Account not found';
  end if;

  if v_account_user_id != (select auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  -- Look for existing project (case-insensitive)
  select id, keywords into v_project_id, v_existing_keywords
  from public.ai_detected_projects
  where account_id = p_account_id
    and lower(name) = lower(p_name);

  if v_project_id is not null then
    -- Merge keywords and update last_activity_at
    update public.ai_detected_projects
    set
      last_activity_at = now(),
      keywords = (
        select array_agg(distinct kw)
        from unnest(
          coalesce(v_existing_keywords, '{}') || coalesce(p_keywords, '{}')
        ) as kw
        where kw is not null
      )
    where id = v_project_id;

    return v_project_id;
  end if;

  -- Create new project
  insert into public.ai_detected_projects (
    account_id, user_id, name, keywords, first_seen_at, last_activity_at, status
  ) values (
    p_account_id, (select auth.uid()), p_name, p_keywords, now(), now(), 'active'
  )
  returning id into v_project_id;

  return v_project_id;
end;
$$;

grant execute on function public.get_or_create_ai_project to authenticated;

-- ============================================================
-- 5. list_user_workspaces
-- Populates the sidebar workspace dropdown
-- ============================================================

create or replace function public.list_user_workspaces()
returns table (
  id uuid,
  provider text,
  email_address text,
  display_name text,
  color_hex text,
  sidebar_position int,
  is_active boolean,
  last_synced_at timestamptz,
  sync_status text,
  sync_error text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      ca.id,
      ca.provider,
      ca.email_address,
      ca.display_name,
      ca.color_hex,
      ca.sidebar_position,
      ca.is_active,
      ca.last_synced_at,
      ca.sync_status,
      ca.sync_error
    from public.connected_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.is_active = true
    order by ca.sidebar_position asc, ca.display_name asc;
end;
$$;

grant execute on function public.list_user_workspaces to authenticated;
