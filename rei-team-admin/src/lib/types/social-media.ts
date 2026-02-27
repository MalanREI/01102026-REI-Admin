// TypeScript types for the REI Social Media Command Center
// Mirrors the Supabase database schema defined in 017_social_media_command_center.sql

// ============================================================
// ENUMS
// ============================================================

export type TeamRole = 'creator' | 'manager' | 'admin';

export type PlatformName =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'google_business';

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'archived';

export type ScheduleType = 'one_time' | 'recurring';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type MediaType = 'none' | 'image' | 'video' | 'carousel';

export type EngagementType = 'comment' | 'dm' | 'mention' | 'review';

export type SentimentType = 'positive' | 'neutral' | 'negative';

// ============================================================
// TABLE ROW TYPES
// ============================================================

export interface TeamMember {
  id: string;
  user_id: string;
  role: TeamRole;
  display_name: string;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialPlatform {
  id: string;
  platform_name: PlatformName;
  account_name: string;
  account_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  is_connected: boolean;
  platform_url: string;
  metadata: Record<string, unknown> | null;
  connected_by: string | null;
  oauth_state: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandVoice {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  example_content: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentType {
  id: string;
  name: string;
  description: string;
  default_brand_voice_id: string | null;
  default_ai_model: string;
  icon: string | null;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentPost {
  id: string;
  title: string | null;
  body: string;
  content_type_id: string | null;
  brand_voice_id: string | null;
  status: PostStatus;
  target_platforms: string[];
  media_urls: string[] | null;
  media_type: MediaType | null;
  ai_model_used: string | null;
  ai_prompt_used: string | null;
  platform_specific_content: Record<string, string> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentSchedule {
  id: string;
  post_id: string;
  schedule_type: ScheduleType;
  scheduled_at: string | null;
  recurrence_rule: string | null;
  recurrence_end_date: string | null;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentApproval {
  id: string;
  post_id: string;
  submitted_by: string;
  reviewed_by: string | null;
  status: ApprovalStatus;
  review_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface AnalyticsSnapshot {
  id: string;
  post_id: string | null;
  platform_id: string;
  platform_post_id: string;
  impressions: number;
  reach: number;
  likes: number;
  comments_count: number;
  shares: number;
  saves: number;
  clicks: number;
  engagement_rate: number | null;
  follower_count_at_time: number | null;
  snapshot_date: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface EngagementInboxItem {
  id: string;
  platform_id: string;
  platform_item_id: string;
  type: EngagementType;
  author_name: string;
  author_avatar_url: string | null;
  author_platform_id: string;
  content: string;
  parent_post_id: string | null;
  sentiment: SentimentType | null;
  is_read: boolean;
  is_replied: boolean;
  created_at: string;
  received_at: string;
}

export interface EngagementReply {
  id: string;
  inbox_item_id: string;
  reply_content: string;
  is_ai_generated: boolean;
  ai_model_used: string | null;
  sent_by: string;
  sent_at: string;
  platform_reply_id: string | null;
}

export interface AiGenerationHistory {
  id: string;
  prompt: string;
  response: string;
  model_used: string;
  content_type: string | null;
  tokens_used: number | null;
  cost_estimate: number | null;
  generated_by: string;
  post_id: string | null;
  created_at: string;
}

export interface NewsletterSource {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// ============================================================
// INSERT TYPES (omit auto-generated fields)
// ============================================================

export type NewTeamMember = Omit<TeamMember, 'id' | 'created_at' | 'updated_at'>;
export type NewSocialPlatform = Omit<SocialPlatform, 'id' | 'created_at' | 'updated_at'>;
export type NewBrandVoice = Omit<BrandVoice, 'id' | 'created_at' | 'updated_at'>;
export type NewContentType = Omit<ContentType, 'id' | 'created_at' | 'updated_at'>;
export type NewContentPost = Omit<ContentPost, 'id' | 'created_at' | 'updated_at'>;
export type NewContentSchedule = Omit<ContentSchedule, 'id' | 'created_at' | 'updated_at'>;
export type NewContentApproval = Omit<ContentApproval, 'id'>;
export type NewAnalyticsSnapshot = Omit<AnalyticsSnapshot, 'id' | 'created_at'>;
export type NewEngagementInboxItem = Omit<EngagementInboxItem, 'id' | 'created_at'>;
export type NewEngagementReply = Omit<EngagementReply, 'id'>;
export type NewAiGenerationHistory = Omit<AiGenerationHistory, 'id' | 'created_at'>;
export type NewNewsletterSource = Omit<NewsletterSource, 'id' | 'created_at'>;

// ============================================================
// UPDATE TYPES
// ============================================================

export type UpdateTeamMember = Partial<NewTeamMember>;
export type UpdateSocialPlatform = Partial<NewSocialPlatform>;
export type UpdateBrandVoice = Partial<NewBrandVoice>;
export type UpdateContentType = Partial<NewContentType>;
export type UpdateContentPost = Partial<NewContentPost>;
export type UpdateContentSchedule = Partial<NewContentSchedule>;
export type UpdateContentApproval = Partial<Pick<ContentApproval, 'status' | 'review_notes' | 'reviewed_by' | 'reviewed_at'>>;
export type UpdateEngagementInboxItem = Partial<Pick<EngagementInboxItem, 'is_read' | 'is_replied' | 'sentiment'>>;

// ============================================================
// EXTENDED / JOINED TYPES
// ============================================================

export interface ContentPostWithRelations extends ContentPost {
  content_type?: ContentType | null;
  brand_voice?: BrandVoice | null;
  created_by_member?: TeamMember | null;
}

export interface EngagementInboxItemWithPlatform extends EngagementInboxItem {
  platform?: SocialPlatform | null;
  replies?: EngagementReply[];
}

export interface ContentScheduleWithPost extends ContentSchedule {
  post?: ContentPost | null;
}

// ============================================================
// CALENDAR / SCHEDULING HELPERS
// ============================================================

/** A flattened event used for calendar display (schedule + post merged). */
export interface CalendarEvent {
  schedule_id: string;
  post_id: string;
  post_title: string | null;
  post_body: string;
  post_status: PostStatus;
  target_platforms: string[];
  media_type: MediaType | null;
  schedule_type: ScheduleType;
  scheduled_at: string | null;
  recurrence_rule: string | null;
  recurrence_end_date: string | null;
  timezone: string;
  is_active: boolean;
  next_run_at: string | null;
}

/** Filter state used by the calendar view. */
export interface CalendarFilter {
  platforms: string[];
  statuses: PostStatus[];
  scheduleType: ScheduleType | '';
}
