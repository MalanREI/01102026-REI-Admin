-- Add is_well_known column to email_folders, backfill from well_known_name presence

alter table public.email_folders
  add column if not exists is_well_known boolean not null default false;

update public.email_folders
  set is_well_known = true
  where well_known_name is not null and is_well_known = false;

create index if not exists idx_email_folders_account_wellknown
  on public.email_folders (account_id, is_well_known desc, position nulls last, display_name);
