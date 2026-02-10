begin;

-- 1) View scope enum (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'crm_view_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.crm_view_type AS ENUM ('company','contact','project');
  END IF;
END $$;

-- 2) Stages are per-view
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_stages' AND column_name='view_type'
  ) THEN
    ALTER TABLE public.crm_stages
      ADD COLUMN view_type public.crm_view_type NOT NULL DEFAULT 'company';
  END IF;
END $$;

-- Replace old unique index (name_lower) with scoped unique (view_type, name_lower)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='crm_stages_name_lower_ux'
  ) THEN
    EXECUTE 'DROP INDEX public.crm_stages_name_lower_ux';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_stages_view_name_lower_ux
  ON public.crm_stages (view_type, name_lower);

CREATE INDEX IF NOT EXISTS crm_stages_view_position_ix
  ON public.crm_stages (view_type, position);

-- 3) Contacts: add stage_id for contact-board
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_contacts' AND column_name='stage_id'
  ) THEN
    ALTER TABLE public.crm_contacts
      ADD COLUMN stage_id uuid NULL REFERENCES public.crm_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_contacts_stage_ix
  ON public.crm_contacts (stage_id);

-- 4) Projects entity
CREATE TABLE IF NOT EXISTS public.crm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL REFERENCES public.crm_companies(id) ON DELETE SET NULL,

  name text NOT NULL,
  name_lower text GENERATED ALWAYS AS (lower(trim(name))) STORED,

  stage_id uuid NULL REFERENCES public.crm_stages(id) ON DELETE SET NULL,

  website text NULL,
  notes text NULL,

  last_activity_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_projects_name_lower_ux
  ON public.crm_projects (name_lower);

CREATE INDEX IF NOT EXISTS crm_projects_stage_ix
  ON public.crm_projects (stage_id);

CREATE INDEX IF NOT EXISTS crm_projects_company_ix
  ON public.crm_projects (company_id);

-- 5) Project ↔ Contacts
CREATE TABLE IF NOT EXISTS public.crm_project_contacts (
  project_id uuid NOT NULL REFERENCES public.crm_projects(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, contact_id)
);

CREATE INDEX IF NOT EXISTS crm_project_contacts_contact_ix
  ON public.crm_project_contacts (contact_id);

-- 6) Activities: optionally tied to a project
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_contact_activities' AND column_name='project_id'
  ) THEN
    ALTER TABLE public.crm_contact_activities
      ADD COLUMN project_id uuid NULL REFERENCES public.crm_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_activities_project_ix
  ON public.crm_contact_activities (project_id, created_at DESC);

-- 7) updated_at trigger for projects (reuse crm_set_updated_at())
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'crm_projects_set_updated_at') THEN
    CREATE TRIGGER crm_projects_set_updated_at
      BEFORE UPDATE ON public.crm_projects
      FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
  END IF;
END $$;

commit;
