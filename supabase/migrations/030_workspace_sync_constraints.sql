-- ============================================================
-- 030: Workspace Sync Constraints
-- Add unique constraint for idempotent attachment upserts
-- ============================================================

alter table public.email_attachments
  add constraint email_attachments_provider_unique
  unique (email_id, provider_attachment_id);
