-- Phase 6: audit log for commercialization.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_user_id_created_at_idx
  on public.audit_log (user_id, created_at desc);

create index audit_log_action_idx
  on public.audit_log (action);

create index audit_log_resource_idx
  on public.audit_log (resource_type, resource_id)
  where resource_type is not null;

alter table public.audit_log enable row level security;

create policy audit_log_select_own
  on public.audit_log
  for select
  using (user_id = auth.uid());
