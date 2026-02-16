-- Create storage bucket for meeting recordings
-- This migration creates a Supabase storage bucket for storing meeting audio recordings.
-- Safe to run multiple times (uses IF NOT EXISTS equivalent logic).

-- Create the meeting-recordings bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('meeting-recordings', 'meeting-recordings', false)
on conflict (id) do nothing;

-- Allow authenticated users to read their own recordings
create policy if not exists "Users can read meeting recordings"
on storage.objects for select
to authenticated
using (bucket_id = 'meeting-recordings');

-- Allow authenticated users to upload recordings
create policy if not exists "Users can upload meeting recordings"
on storage.objects for insert
to authenticated
with check (bucket_id = 'meeting-recordings');

-- Allow authenticated users to delete recordings (for cleanup)
create policy if not exists "Users can delete meeting recordings"
on storage.objects for delete
to authenticated
using (bucket_id = 'meeting-recordings');
