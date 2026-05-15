-- Phase 8a: persisted conversation threads with Claude.

create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  context_type text not null check (context_type in ('email', 'conversation', 'sender', 'search', 'project')),
  context_id text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_threads_user_context_idx on public.ai_threads (user_id, context_type, context_id);

create table public.ai_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create index ai_thread_messages_thread_id_idx on public.ai_thread_messages (thread_id, created_at);

alter table public.ai_threads enable row level security;
alter table public.ai_thread_messages enable row level security;

create policy ai_threads_select_own on public.ai_threads for select using (user_id = auth.uid());
create policy ai_threads_insert_own on public.ai_threads for insert with check (user_id = auth.uid());
create policy ai_threads_update_own on public.ai_threads for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ai_thread_messages_select_own on public.ai_thread_messages for select using (
  exists (select 1 from public.ai_threads where ai_threads.id = ai_thread_messages.thread_id and ai_threads.user_id = auth.uid())
);
create policy ai_thread_messages_insert_own on public.ai_thread_messages for insert with check (
  exists (select 1 from public.ai_threads where ai_threads.id = ai_thread_messages.thread_id and ai_threads.user_id = auth.uid())
);
