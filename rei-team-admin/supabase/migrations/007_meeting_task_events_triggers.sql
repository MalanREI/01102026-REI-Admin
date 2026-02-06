-- Auto-log meeting task activity in public.meeting_task_events
-- This helps "bullet proof" the activity log so updates don't silently miss entries.

create or replace function public.log_meeting_task_activity()
returns trigger
language plpgsql
security definer
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if (tg_op = 'INSERT') then
    insert into public.meeting_task_events (task_id, event_type, payload, created_by)
    values (new.id, 'created', jsonb_build_object('title', new.title), auth.uid());
    return new;
  end if;

  if (tg_op = 'DELETE') then
    insert into public.meeting_task_events (task_id, event_type, payload, created_by)
    values (old.id, 'deleted', '{}'::jsonb, auth.uid());
    return old;
  end if;

  -- UPDATE: capture diffs for the most important fields
  if (to_jsonb(old.title) is distinct from to_jsonb(new.title)) then
    changes := changes || jsonb_build_object('title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;

  if (to_jsonb(old.status) is distinct from to_jsonb(new.status)) then
    changes := changes || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if (to_jsonb(old.priority) is distinct from to_jsonb(new.priority)) then
    changes := changes || jsonb_build_object('priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;

  if (to_jsonb(old.owner_id) is distinct from to_jsonb(new.owner_id)) then
    changes := changes || jsonb_build_object('owner_id', jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  end if;

  if (to_jsonb(old.owner_email) is distinct from to_jsonb(new.owner_email)) then
    changes := changes || jsonb_build_object('owner_email', jsonb_build_object('from', old.owner_email, 'to', new.owner_email));
  end if;

  if (to_jsonb(old.owner_name) is distinct from to_jsonb(new.owner_name)) then
    changes := changes || jsonb_build_object('owner_name', jsonb_build_object('from', old.owner_name, 'to', new.owner_name));
  end if;

  if (to_jsonb(old.start_date) is distinct from to_jsonb(new.start_date)) then
    changes := changes || jsonb_build_object('start_date', jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;

  if (to_jsonb(old.due_date) is distinct from to_jsonb(new.due_date)) then
    changes := changes || jsonb_build_object('due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;

  if (to_jsonb(old.notes) is distinct from to_jsonb(new.notes)) then
    changes := changes || jsonb_build_object('notes', jsonb_build_object('from', old.notes, 'to', new.notes));
  end if;

  if (to_jsonb(old.column_id) is distinct from to_jsonb(new.column_id)) then
    changes := changes || jsonb_build_object('column_id', jsonb_build_object('from', old.column_id, 'to', new.column_id));
  end if;

  if (to_jsonb(old.position) is distinct from to_jsonb(new.position)) then
    changes := changes || jsonb_build_object('position', jsonb_build_object('from', old.position, 'to', new.position));
  end if;

  if (changes <> '{}'::jsonb) then
    insert into public.meeting_task_events (task_id, event_type, payload, created_by)
    values (new.id, 'updated', jsonb_build_object('changes', changes), auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_meeting_task_activity on public.meeting_tasks;

create trigger trg_log_meeting_task_activity
after insert or update or delete on public.meeting_tasks
for each row execute function public.log_meeting_task_activity();
