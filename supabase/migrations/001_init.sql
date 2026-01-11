-- REI Team Admin: schema + RLS
-- Run this in Supabase SQL Editor (or via migration tooling)

create extension if not exists "pgcrypto";

-- Profiles (role system)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

-- Automatically create profile rows on signup/user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'member')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Shared Links
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  purpose text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Meetings Kanban
create table if not exists public.kanban_columns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  column_id uuid not null references public.kanban_columns(id) on delete cascade,
  position int not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Sales Funnel Leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  phone text,
  email text,
  status text not null default 'New',
  notes text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

-- Seed default kanban columns if empty
insert into public.kanban_columns (name, position)
select * from (values
  ('Backlog', 1),
  ('In Progress', 2),
  ('Waiting', 3),
  ('Done', 4)
) as v(name, position)
where not exists (select 1 from public.kanban_columns);

-- =========
-- RLS
-- =========
alter table public.profiles enable row level security;
alter table public.links enable row level security;
alter table public.kanban_columns enable row level security;
alter table public.kanban_cards enable row level security;
alter table public.leads enable row level security;

-- Profiles: user can read all profiles (internal team), update their own
create policy "profiles_read_all"
on public.profiles for select
to authenticated
using (true);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Links: any authenticated user can CRUD (internal)
create policy "links_select"
on public.links for select
to authenticated using (true);

create policy "links_insert"
on public.links for insert
to authenticated with check (true);

create policy "links_update"
on public.links for update
to authenticated using (true) with check (true);

create policy "links_delete"
on public.links for delete
to authenticated using (true);

-- Kanban: any authenticated user can CRUD
create policy "kanban_columns_all"
on public.kanban_columns for all
to authenticated using (true) with check (true);

create policy "kanban_cards_all"
on public.kanban_cards for all
to authenticated using (true) with check (true);

-- Leads: any authenticated user can CRUD
create policy "leads_all"
on public.leads for all
to authenticated using (true) with check (true);
