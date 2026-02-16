-- Add color_hex field to meeting_task_statuses for customizable status colors
alter table public.meeting_task_statuses 
add column if not exists color_hex text;

-- Set default colors for common status names
update public.meeting_task_statuses
set color_hex = case
  when lower(name) like '%complete%' then '#16A34A'  -- green
  when lower(name) like '%progress%' or lower(name) like '%doing%' then '#2563EB'  -- blue
  when lower(name) like '%review%' then '#EA580C'  -- orange
  when lower(name) like '%wait%' then '#CA8A04'  -- yellow
  else '#6B7280'  -- gray
end
where color_hex is null;
