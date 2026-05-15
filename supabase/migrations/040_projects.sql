-- Phase 8b: project taxonomy.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  parent_id uuid references public.projects(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index projects_user_slug_idx on public.projects (user_id, slug);
create index projects_user_id_idx on public.projects (user_id);
create index projects_parent_id_idx on public.projects (parent_id) where parent_id is not null;

create table public.project_keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  weight real not null default 1.0,
  learned_from_email_id uuid references public.emails(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index project_keywords_project_keyword_idx on public.project_keywords (project_id, keyword);

create table public.project_people (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email_address text not null,
  display_name text,
  role text,
  confidence_score real not null default 1.0,
  created_at timestamptz not null default now()
);

create unique index project_people_project_email_idx on public.project_people (project_id, email_address);

create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  folder_id uuid references public.email_folders(id) on delete cascade,
  intent text not null check (intent in ('active', 'awaiting_reply', 'awaiting_action', 'done', 'archive', 'custom')),
  is_auto_managed boolean not null default false,
  created_at timestamptz not null default now()
);

create index project_folders_project_id_idx on public.project_folders (project_id);

create table public.email_project_assignments (
  email_id uuid primary key references public.emails(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  confidence_score real not null default 1.0,
  assigned_by text not null check (assigned_by in ('ai', 'user', 'rule')),
  assigned_at timestamptz not null default now(),
  needs_review boolean not null default false
);

create index email_project_assignments_user_review_idx
  on public.email_project_assignments (user_id, needs_review) where needs_review = true;
create index email_project_assignments_project_id_idx
  on public.email_project_assignments (project_id);

alter table public.projects enable row level security;
alter table public.project_keywords enable row level security;
alter table public.project_people enable row level security;
alter table public.project_folders enable row level security;
alter table public.email_project_assignments enable row level security;

create policy projects_select_own on public.projects for select using (user_id = auth.uid());
create policy projects_insert_own on public.projects for insert with check (user_id = auth.uid());
create policy projects_update_own on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy projects_delete_own on public.projects for delete using (user_id = auth.uid());

create policy project_keywords_select on public.project_keywords for select using (
  exists (select 1 from public.projects where projects.id = project_keywords.project_id and projects.user_id = auth.uid()));
create policy project_keywords_insert on public.project_keywords for insert with check (
  exists (select 1 from public.projects where projects.id = project_keywords.project_id and projects.user_id = auth.uid()));

create policy project_people_select on public.project_people for select using (
  exists (select 1 from public.projects where projects.id = project_people.project_id and projects.user_id = auth.uid()));
create policy project_people_insert on public.project_people for insert with check (
  exists (select 1 from public.projects where projects.id = project_people.project_id and projects.user_id = auth.uid()));

create policy project_folders_select on public.project_folders for select using (
  exists (select 1 from public.projects where projects.id = project_folders.project_id and projects.user_id = auth.uid()));

create policy email_project_assignments_select_own on public.email_project_assignments for select using (user_id = auth.uid());
create policy email_project_assignments_insert_own on public.email_project_assignments for insert with check (user_id = auth.uid());
create policy email_project_assignments_update_own on public.email_project_assignments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
