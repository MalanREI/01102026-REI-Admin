// TypeScript types for the Workspace module
// Mirrors the Supabase database schema defined in 026_workspace_foundation.sql
// and 027_workspace_intelligence.sql

// ============================================================
// ENUMS (matching CHECK constraints)
// ============================================================

export type EmailProvider = 'gmail' | 'outlook';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type TriageCategory = 'fyi' | 'needs_response' | 'action_required' | 'decision_needed' | 'cc_only';

export type ExtractionStatus = 'pending' | 'extracted' | 'failed' | 'skipped';

export type AiClassificationStatus = 'pending' | 'classified' | 'failed' | 'skipped';

export type UnsubscribeMethod = 'list_unsubscribe_http' | 'list_unsubscribe_mailto' | 'ai_found_link' | 'manual';

export type UnsubscribeStatus = 'pending' | 'success' | 'failed' | 'skipped';

export type EmbeddingSourceType =
  | 'email'
  | 'email_attachment'
  | 'meeting_transcript'
  | 'meeting_note'
  | 'meeting_minutes'
  | 'site_report'
  | 'site_report_item'
  | 'lesson'
  | 'commitment'
  | 'schedule_item';

export type CommitmentSourceType = 'email_sent' | 'email_received' | 'meeting';

export type CommitmentOwner = 'me' | 'them';

export type CommitmentStatus = 'open' | 'fulfilled' | 'overdue' | 'cancelled' | 'snoozed';

export type ProjectStatus = 'active' | 'completed' | 'archived';

export type TopicStatus = 'active' | 'resolved' | 'archived';

export type TopicItemType = 'email' | 'meeting' | 'site_report' | 'commitment' | 'attachment';

export type ScheduleItemStatus = 'on_track' | 'at_risk' | 'slipped' | 'completed' | 'cancelled';

export type AskQueryScope = 'current_workspace' | 'all_workspaces';

// ============================================================
// TABLE ROW TYPES
// ============================================================

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email_address: string;
  display_name: string;
  color_hex: string;
  sidebar_position: number;
  refresh_token: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  backfill_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface AiDetectedProject {
  id: string;
  account_id: string;
  user_id: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  first_seen_at: string | null;
  last_activity_at: string | null;
  status: ProjectStatus;
  is_user_confirmed: boolean;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  account_id: string;
  user_id: string;
  ai_project_id: string | null;
  provider_message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: Record<string, unknown>[] | null;
  cc_addresses: Record<string, unknown>[] | null;
  bcc_addresses: Record<string, unknown>[] | null;
  sent_at: string | null;
  received_at: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  is_sent_by_me: boolean;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  is_promotional: boolean;
  list_unsubscribe_header: string | null;
  triage_category: TriageCategory | null;
  triage_confidence: number | null;
  raw_headers: Record<string, unknown> | null;
  provider_etag: string | null;
  folder_id: string | null;
  local_origin: boolean;
  user_state: 'handled' | 'followup' | null;
  created_at: string;
  updated_at: string;
}

export interface EmailFolder {
  id: string;
  user_id: string;
  account_id: string;
  provider_folder_id: string;
  well_known_name: string | null;
  display_name: string;
  parent_folder_id: string | null;
  unread_count: number;
  total_count: number;
  is_hidden: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface EmailSignature {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  body_html: string;
  is_default: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface EmailDraft {
  id: string;
  user_id: string;
  account_id: string;
  mode: 'compose' | 'reply' | 'replyAll' | 'forward';
  in_reply_to_message_id: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  body_html: string;
  signature_id: string | null;
  created_at: string;
  updated_at: string;
}

export type NewEmailSignature = Omit<EmailSignature, 'id' | 'created_at' | 'updated_at'>;
export type UpdateEmailSignature = Partial<NewEmailSignature>;

export interface CalendarEvent {
  id: string;
  user_id: string;
  account_id: string;
  ai_project_id: string | null;
  provider_event_id: string;
  provider_etag: string | null;
  ical_uid: string | null;
  series_master_id: string | null;
  subject: string | null;
  body_preview: string | null;
  body_html: string | null;
  body_text: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  time_zone: string | null;
  location: string | null;
  online_meeting_url: string | null;
  online_meeting_provider: string | null;
  organizer_email: string | null;
  organizer_name: string | null;
  attendees: Array<{
    emailAddress?: { address?: string; name?: string };
    type?: string;
    status?: { response?: string; time?: string };
  }>;
  is_organizer: boolean;
  response_status: string | null;
  show_as: string | null;
  sensitivity: string | null;
  is_cancelled: boolean;
  importance: string | null;
  is_recurring: boolean;
  recurrence: unknown;
  local_origin: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAttachment {
  id: string;
  email_id: string;
  user_id: string;
  account_id: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  extracted_text: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  ai_document_type: string | null;
  ai_contractor: string | null;
  ai_project_id: string | null;
  ai_tags: string[] | null;
  ai_classification_status: AiClassificationStatus;
  provider_attachment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnsubscribeAction {
  id: string;
  user_id: string;
  account_id: string;
  sender_email: string;
  sender_domain: string | null;
  method: UnsubscribeMethod | null;
  status: UnsubscribeStatus;
  executed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface Embedding {
  id: string;
  user_id: string;
  account_id: string | null;
  source_type: EmbeddingSourceType;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  // embedding vector(1536) excluded — never round-trip vectors through the client
  ai_project_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Commitment {
  id: string;
  user_id: string;
  account_id: string;
  ai_project_id: string | null;
  source_type: CommitmentSourceType;
  source_id: string;
  owner: CommitmentOwner;
  counterparty_email: string | null;
  counterparty_name: string | null;
  description: string;
  due_date: string | null;
  status: CommitmentStatus;
  snoozed_until: string | null;
  fulfilled_at: string | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  user_id: string;
  account_id: string;
  ai_project_id: string | null;
  name: string;
  summary: string | null;
  status: TopicStatus;
  first_seen_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopicItem {
  id: string;
  topic_id: string;
  user_id: string;
  item_type: TopicItemType;
  item_id: string;
  relevance_score: number | null;
  created_at: string;
}

export interface LessonLearned {
  id: string;
  user_id: string;
  account_id: string;
  ai_project_id: string | null;
  title: string;
  situation: string | null;
  what_happened: string | null;
  what_we_learned: string | null;
  what_to_do_differently: string | null;
  source_topic_id: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItem {
  id: string;
  user_id: string;
  account_id: string;
  ai_project_id: string | null;
  title: string;
  description: string | null;
  milestone_date: string | null;
  original_milestone_date: string | null;
  status: ScheduleItemStatus;
  source_type: string | null;
  source_id: string | null;
  last_updated_from_source_at: string | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface AskQuery {
  id: string;
  user_id: string;
  account_id: string | null;
  query: string;
  answer: string | null;
  sources: Record<string, unknown>[];
  scope: AskQueryScope;
  model_used: string | null;
  tokens_used: number | null;
  created_at: string;
}

export interface DailyDigest {
  id: string;
  user_id: string;
  account_id: string;
  digest_date: string;
  content: Record<string, unknown>;
  sent_via_email: boolean;
  email_sent_at: string | null;
  created_at: string;
}

// ============================================================
// INSERT TYPES (omit auto-generated fields)
// ============================================================

export type NewConnectedAccount = Omit<ConnectedAccount, 'id' | 'created_at' | 'updated_at'>;
export type NewAiDetectedProject = Omit<AiDetectedProject, 'id' | 'created_at' | 'updated_at'>;
export type NewEmail = Omit<Email, 'id' | 'created_at' | 'updated_at'>;
export type NewEmailAttachment = Omit<EmailAttachment, 'id' | 'created_at' | 'updated_at'>;
export type NewUnsubscribeAction = Omit<UnsubscribeAction, 'id' | 'created_at'>;
export type NewCommitment = Omit<Commitment, 'id' | 'created_at' | 'updated_at'>;
export type NewTopic = Omit<Topic, 'id' | 'created_at' | 'updated_at'>;
export type NewTopicItem = Omit<TopicItem, 'id' | 'created_at'>;
export type NewLessonLearned = Omit<LessonLearned, 'id' | 'created_at' | 'updated_at'>;
export type NewScheduleItem = Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at'>;
export type NewAskQuery = Omit<AskQuery, 'id' | 'created_at'>;
export type NewDailyDigest = Omit<DailyDigest, 'id' | 'created_at'>;

// ============================================================
// UPDATE TYPES
// ============================================================

export type UpdateConnectedAccount = Partial<NewConnectedAccount>;
export type UpdateAiDetectedProject = Partial<NewAiDetectedProject>;
export type UpdateEmail = Partial<NewEmail>;
export type UpdateEmailAttachment = Partial<NewEmailAttachment>;
export type UpdateCommitment = Partial<NewCommitment>;
export type UpdateTopic = Partial<NewTopic>;
export type UpdateLessonLearned = Partial<NewLessonLearned>;
export type UpdateScheduleItem = Partial<NewScheduleItem>;

// ============================================================
// RPC RETURN TYPES
// ============================================================

export interface WorkspaceListItem {
  id: string;
  provider: EmailProvider;
  email_address: string;
  display_name: string;
  color_hex: string;
  sidebar_position: number;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
}

export interface WorkspaceStats {
  total_emails: number;
  unread_count: number;
  needs_response_count: number;
  action_required_count: number;
  decision_needed_count: number;
  open_commitments_count: number;
  overdue_commitments_count: number;
  active_projects_count: number;
  active_topics_count: number;
  last_synced_at: string | null;
  sync_status: SyncStatus;
}

export interface AskQueryResult {
  answer: string;
  sources: Array<{
    source_type: EmbeddingSourceType;
    source_id: string;
    snippet: string;
    similarity: number;
  }>;
  model_used: string;
  tokens_used: number;
}
