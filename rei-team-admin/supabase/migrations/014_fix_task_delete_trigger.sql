-- Fix: Remove the DELETE handler from the task activity trigger.
-- The AFTER DELETE trigger tries to INSERT into meeting_task_events
-- referencing old.id, but that task_id no longer exists at that point
-- in the transaction, causing an FK violation.
--
-- Since meeting_task_events has ON DELETE CASCADE on task_id,
-- all associated events are automatically cleaned up when a task is deleted.
-- We don't need to log a "deleted" event — the absence of the task IS the record.

CREATE OR REPLACE FUNCTION public.log_meeting_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if (tg_op = 'INSERT') then
    insert into public.meeting_task_events (task_id, event_type, payload, created_by)
    values (new.id, 'created', jsonb_build_object('title', new.title), auth.uid());
    return new;
  end if;

  -- SKIP DELETE — cannot insert a reference to a task that is being deleted.
  -- The ON DELETE CASCADE on the FK automatically cleans up events.
  if (tg_op = 'DELETE') then
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
