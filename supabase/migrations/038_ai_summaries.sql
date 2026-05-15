-- Phase 8a: AI-generated summaries of individual emails.

create table public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_version int not null default 1,
  summary_text text not null,
  key_points jsonb not null default '[]'::jsonb,
  model text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create unique index ai_summaries_email_version_idx
  on public.ai_summaries (email_id, summary_version);
create index ai_summaries_user_id_idx
  on public.ai_summaries (user_id);

alter table public.ai_summaries enable row level security;

create policy ai_summaries_select_own on public.ai_summaries
  for select using (user_id = auth.uid());
create policy ai_summaries_insert_own on public.ai_summaries
  for insert with check (user_id = auth.uid());
