-- Phase 6: per-user settings, including encrypted Anthropic API key (BYO model).

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anthropic_api_key_encrypted text,
  anthropic_api_key_last_four text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy user_settings_select_own
  on public.user_settings
  for select
  using (user_id = auth.uid());

create policy user_settings_insert_own
  on public.user_settings
  for insert
  with check (user_id = auth.uid());

create policy user_settings_update_own
  on public.user_settings
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
