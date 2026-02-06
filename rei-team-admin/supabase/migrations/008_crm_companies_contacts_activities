begin;

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- Helper functions
-- ============================================================
create or replace function public.crm_norm_text(t text)
returns text
language sql
immutable
as $$
  select nullif(trim(coalesce(t,'')), '');
$$;

create or replace function public.crm_norm_phone(t text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(t,''), '[^0-9]+', '', 'g'), '');
$$;

-- ============================================================
-- CRM Stages (Kanban columns)
-- ============================================================
create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_lower text generated always as (lower(trim(name))) stored,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_stages_name_lower_ux
  on public.crm_stages (name_lower);

create index if not exists crm_stages_position_ix
  on public.crm_stages (position);

-- Seed defaults if empty
insert into public.crm_stages (name, position)
select v.name, v.position
from (values
  ('New', 10),
  ('Contact Made', 20),
  ('Demo Scheduled', 30),
  ('Proposal Made', 40),
  ('Negotiations Started', 50),
  ('Won', 90),
  ('Lost', 99)
) as v(name, position)
where not exists (select 1 from public.crm_stages);

-- ============================================================
-- CRM Companies (Kanban cards)
-- ============================================================
create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_lower text generated always as (lower(trim(name))) stored,

  stage_id uuid null references public.crm_stages(id) on delete set null,

  website text null,
  phone text null,
  email text null,
  notes text null,

  main_contact_id uuid null,

  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_companies_name_lower_ux
  on public.crm_companies (name_lower);

create index if not exists crm_companies_stage_ix
  on public.crm_companies (stage_id);

create index if not exists crm_companies_last_activity_ix
  on public.crm_companies (last_activity_at desc nulls last);

-- ============================================================
-- CRM Contacts
-- ============================================================
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,

  first_name text null,
  last_name text null,
  full_name text null,

  title text null,
  phone text null,
  phone_norm text generated always as (public.crm_norm_phone(phone)) stored,
  email text null,
  email_lower text generated always as (lower(trim(coalesce(email,'')))) stored,

  notes text null,

  is_main boolean not null default false,

  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_company_ix
  on public.crm_contacts (company_id);

create index if not exists crm_contacts_last_activity_ix
  on public.crm_contacts (last_activity_at desc nulls last);

create unique index if not exists crm_contacts_company_email_ux
  on public.crm_contacts (company_id, email_lower)
  where public.crm_norm_text(email) is not null;

create unique index if not exists crm_contacts_company_phone_ux
  on public.crm_contacts (company_id, phone_norm)
  where public.crm_norm_phone(phone) is not null;

-- Link company.main_contact_id AFTER contacts exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_companies_main_contact_fk'
  ) then
    alter table public.crm_companies
      add constraint crm_companies_main_contact_fk
      foreign key (main_contact_id)
      references public.crm_contacts(id)
      on delete set null;
  end if;
end $$;

-- ============================================================
-- ENUM: Activity Kind (SAFE CREATION)
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'crm_activity_kind'
      and n.nspname = 'public'
  ) then
    create type public.crm_activity_kind as enum (
      'Call',
      'Voicemail',
      'Text',
      'Email',
      'Note'
    );
  end if;
end $$;

-- ============================================================
-- CRM Contact Activities
-- ============================================================
create table if not exists public.crm_contact_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  contact_id uuid null references public.crm_contacts(id) on delete set null,

  kind public.crm_activity_kind not null default 'Note',
  summary text not null,

  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_activities_company_ix
  on public.crm_contact_activities (company_id, created_at desc);

create index if not exists crm_activities_contact_ix
  on public.crm_contact_activities (contact_id, created_at desc);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'crm_companies_set_updated_at') then
    create trigger crm_companies_set_updated_at
      before update on public.crm_companies
      for each row execute function public.crm_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'crm_contacts_set_updated_at') then
    create trigger crm_contacts_set_updated_at
      before update on public.crm_contacts
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

-- ============================================================
-- Activity rollups
-- ============================================================
create or replace function public.crm_rollup_activity()
returns trigger
language plpgsql
as $$
begin
  update public.crm_companies
    set last_activity_at =
      greatest(coalesce(last_activity_at, 'epoch'::timestamptz), new.created_at)
    where id = new.company_id;

  if new.contact_id is not null then
    update public.crm_contacts
      set last_activity_at =
        greatest(coalesce(last_activity_at, 'epoch'::timestamptz), new.created_at)
      where id = new.contact_id;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'crm_activities_rollup') then
    create trigger crm_activities_rollup
      after insert on public.crm_contact_activities
      for each row execute function public.crm_rollup_activity();
  end if;
end $$;

-- ============================================================
-- RPC: Set Main Contact
-- ============================================================
create or replace function public.crm_set_main_contact(
  p_company_id uuid,
  p_contact_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.crm_companies
    set main_contact_id = p_contact_id
    where id = p_company_id;

  update public.crm_contacts
    set is_main = (id = p_contact_id)
    where company_id = p_company_id;
end;
$$;

revoke all on function public.crm_set_main_contact(uuid, uuid) from public;
grant execute on function public.crm_set_main_contact(uuid, uuid) to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.crm_stages enable row level security;
alter table public.crm_companies enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_contact_activities enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname='crm_stages_all_auth') then
    create policy crm_stages_all_auth
      on public.crm_stages
      for all to authenticated
      using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname='crm_companies_all_auth') then
    create policy crm_companies_all_auth
      on public.crm_companies
      for all to authenticated
      using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname='crm_contacts_all_auth') then
    create policy crm_contacts_all_auth
      on public.crm_contacts
      for all to authenticated
      using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname='crm_activities_all_auth') then
    create policy crm_activities_all_auth
      on public.crm_contact_activities
      for all to authenticated
      using (true) with check (true);
  end if;
end $$;

commit;
