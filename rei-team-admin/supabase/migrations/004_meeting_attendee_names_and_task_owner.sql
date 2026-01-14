-- Add attendee names + non-auth task owner fields

alter table if exists public.meeting_attendees
  add column if not exists full_name text;

alter table if exists public.meeting_tasks
  add column if not exists owner_email text,
  add column if not exists owner_name text;

create index if not exists idx_meeting_tasks_owner_email on public.meeting_tasks (owner_email);

do $$
begin
  begin
    update public.meeting_tasks t
      set owner_email = u.email
    from auth.users u
    where t.owner_id = u.id
      and t.owner_email is null;
  exception when others then
    -- ignore
  end;
end $$;

