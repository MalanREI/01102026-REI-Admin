-- Migration: Meeting Management Fixes
-- Adds RLS policies for milestones and notes, priority management table, and attendee colors

-- 1. Enable RLS and add policies for milestones and ongoing notes
ALTER TABLE public.meeting_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_ongoing_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meeting_milestones'
      AND policyname = 'meeting_milestones_all'
  ) THEN
    CREATE POLICY meeting_milestones_all
      ON public.meeting_milestones
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meeting_ongoing_notes'
      AND policyname = 'meeting_ongoing_notes_all'
  ) THEN
    CREATE POLICY meeting_ongoing_notes_all
      ON public.meeting_ongoing_notes
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;


-- 2. Create priority management table (similar to statuses)
CREATE TABLE IF NOT EXISTS public.meeting_task_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 1,
  color_hex text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_priorities_meeting
  ON public.meeting_task_priorities (meeting_id, position);

ALTER TABLE public.meeting_task_priorities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meeting_task_priorities'
      AND policyname = 'meeting_task_priorities_all'
  ) THEN
    CREATE POLICY meeting_task_priorities_all
      ON public.meeting_task_priorities
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;


-- 3. Add color_hex and full_name to meeting_attendees for canonical color management
-- This is idempotent and safe to run multiple times.
ALTER TABLE public.meeting_attendees
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS color_hex text;
