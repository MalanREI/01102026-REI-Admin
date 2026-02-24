// Typed Supabase helper functions for the REI Social Media Command Center
// Uses the browser Supabase client. For server-side use, pass your own client.

import { supabaseBrowser } from '@/src/lib/supabase/browser';
import type {
  TeamMember,
  SocialPlatform,
  BrandVoice,
  ContentType,
  ContentPost,
  ContentSchedule,
  ContentApproval,
  AnalyticsSnapshot,
  EngagementInboxItem,
  EngagementReply,
  AiGenerationHistory,
  NewsletterSource,
  NewTeamMember,
  NewSocialPlatform,
  NewBrandVoice,
  NewContentType,
  NewContentPost,
  NewContentSchedule,
  NewContentApproval,
  NewAnalyticsSnapshot,
  NewEngagementInboxItem,
  NewEngagementReply,
  NewAiGenerationHistory,
  NewNewsletterSource,
  UpdateTeamMember,
  UpdateSocialPlatform,
  UpdateBrandVoice,
  UpdateContentType,
  UpdateContentPost,
  UpdateContentSchedule,
  UpdateContentApproval,
  UpdateEngagementInboxItem,
  PostStatus,
  TeamRole,
  PlatformName,
} from '@/src/lib/types/social-media';

// ============================================================
// TEAM MEMBERS
// ============================================================

export async function getTeamMembers() {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('team_members')
    .select('*')
    .eq('is_active', true)
    .order('display_name');
  if (error) throw error;
  return data as TeamMember[];
}

export async function getTeamMemberByUserId(userId: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('team_members')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data as TeamMember;
}

export async function createTeamMember(member: NewTeamMember) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('team_members')
    .insert(member)
    .select()
    .single();
  if (error) throw error;
  return data as TeamMember;
}

export async function updateTeamMember(id: string, updates: UpdateTeamMember) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('team_members')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TeamMember;
}

export async function deactivateTeamMember(id: string) {
  return updateTeamMember(id, { is_active: false });
}

/** Returns the role of the currently authenticated user, or null if not a team member. */
export async function getCurrentUserRole(): Promise<TeamRole | null> {
  const db = supabaseBrowser();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  return (data?.role as TeamRole) ?? null;
}

export async function hasRole(role: TeamRole): Promise<boolean> {
  const currentRole = await getCurrentUserRole();
  if (!currentRole) return false;
  const hierarchy: TeamRole[] = ['creator', 'manager', 'admin'];
  return hierarchy.indexOf(currentRole) >= hierarchy.indexOf(role);
}

// ============================================================
// SOCIAL PLATFORMS
// ============================================================

export async function getSocialPlatforms() {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('social_platforms')
    .select('*')
    .order('platform_name');
  if (error) throw error;
  return data as SocialPlatform[];
}

export async function getConnectedPlatforms() {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('social_platforms')
    .select('*')
    .eq('is_connected', true)
    .order('platform_name');
  if (error) throw error;
  return data as SocialPlatform[];
}

export async function getPlatformByName(name: PlatformName) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('social_platforms')
    .select('*')
    .eq('platform_name', name)
    .single();
  if (error) throw error;
  return data as SocialPlatform;
}

export async function createSocialPlatform(platform: NewSocialPlatform) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('social_platforms')
    .insert(platform)
    .select()
    .single();
  if (error) throw error;
  return data as SocialPlatform;
}

export async function updateSocialPlatform(id: string, updates: UpdateSocialPlatform) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('social_platforms')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SocialPlatform;
}

// ============================================================
// BRAND VOICES
// ============================================================

export async function getBrandVoices() {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('brand_voices')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as BrandVoice[];
}

export async function getDefaultBrandVoice() {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('brand_voices')
    .select('*')
    .eq('is_default', true)
    .single();
  if (error) throw error;
  return data as BrandVoice;
}

export async function createBrandVoice(voice: NewBrandVoice) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('brand_voices')
    .insert(voice)
    .select()
    .single();
  if (error) throw error;
  return data as BrandVoice;
}

export async function updateBrandVoice(id: string, updates: UpdateBrandVoice) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('brand_voices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as BrandVoice;
}

export async function deleteBrandVoice(id: string) {
  const db = supabaseBrowser();
  const { error } = await db.from('brand_voices').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CONTENT TYPES
// ============================================================

export async function getContentTypes(activeOnly = true) {
  const db = supabaseBrowser();
  let query = db.from('content_types').select('*').order('name');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as ContentType[];
}

export async function createContentType(contentType: NewContentType) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_types')
    .insert(contentType)
    .select()
    .single();
  if (error) throw error;
  return data as ContentType;
}

export async function updateContentType(id: string, updates: UpdateContentType) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_types')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ContentType;
}

// ============================================================
// CONTENT POSTS
// ============================================================

export async function getContentPosts(status?: PostStatus) {
  const db = supabaseBrowser();
  let query = db
    .from('content_posts')
    .select('*, content_type:content_types(*), brand_voice:brand_voices(*)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data as ContentPost[];
}

export async function getContentPostById(id: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_posts')
    .select('*, content_type:content_types(*), brand_voice:brand_voices(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ContentPost;
}

export async function getContentPostsByCreator(createdBy: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_posts')
    .select('*')
    .eq('created_by', createdBy)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ContentPost[];
}

export async function createContentPost(post: NewContentPost) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_posts')
    .insert(post)
    .select()
    .single();
  if (error) throw error;
  return data as ContentPost;
}

export async function updateContentPost(id: string, updates: UpdateContentPost) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ContentPost;
}

export async function deleteContentPost(id: string) {
  const db = supabaseBrowser();
  const { error } = await db.from('content_posts').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CONTENT SCHEDULES
// ============================================================

export async function getContentSchedules(activeOnly = true) {
  const db = supabaseBrowser();
  let query = db
    .from('content_schedules')
    .select('*, post:content_posts(*)')
    .order('scheduled_at', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as ContentSchedule[];
}

export async function getSchedulesByPost(postId: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_schedules')
    .select('*')
    .eq('post_id', postId);
  if (error) throw error;
  return data as ContentSchedule[];
}

export async function createContentSchedule(schedule: NewContentSchedule) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_schedules')
    .insert(schedule)
    .select()
    .single();
  if (error) throw error;
  return data as ContentSchedule;
}

export async function updateContentSchedule(id: string, updates: UpdateContentSchedule) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ContentSchedule;
}

// ============================================================
// CONTENT APPROVALS
// ============================================================

export async function getPendingApprovals() {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_approvals')
    .select('*, post:content_posts(*), submitted_by_member:team_members!submitted_by(*)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return data as ContentApproval[];
}

export async function getApprovalsByPost(postId: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_approvals')
    .select('*')
    .eq('post_id', postId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data as ContentApproval[];
}

export async function createContentApproval(approval: NewContentApproval) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_approvals')
    .insert(approval)
    .select()
    .single();
  if (error) throw error;
  return data as ContentApproval;
}

export async function reviewContentApproval(id: string, updates: UpdateContentApproval) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_approvals')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ContentApproval;
}

// ============================================================
// ANALYTICS SNAPSHOTS
// ============================================================

export async function getAnalyticsByDateRange(
  platformId: string,
  startDate: string,
  endDate: string
) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('analytics_snapshots')
    .select('*')
    .eq('platform_id', platformId)
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)
    .order('snapshot_date', { ascending: true });
  if (error) throw error;
  return data as AnalyticsSnapshot[];
}

export async function getAnalyticsByPost(postId: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('analytics_snapshots')
    .select('*')
    .eq('post_id', postId)
    .order('snapshot_date', { ascending: false });
  if (error) throw error;
  return data as AnalyticsSnapshot[];
}

export async function createAnalyticsSnapshot(snapshot: NewAnalyticsSnapshot) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('analytics_snapshots')
    .insert(snapshot)
    .select()
    .single();
  if (error) throw error;
  return data as AnalyticsSnapshot;
}

// ============================================================
// ENGAGEMENT INBOX
// ============================================================

export async function getEngagementInbox(platformId?: string, unreadOnly = false) {
  const db = supabaseBrowser();
  let query = db
    .from('engagement_inbox')
    .select('*')
    .order('received_at', { ascending: false });
  if (platformId) query = query.eq('platform_id', platformId);
  if (unreadOnly) query = query.eq('is_read', false);
  const { data, error } = await query;
  if (error) throw error;
  return data as EngagementInboxItem[];
}

export async function markInboxItemRead(id: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('engagement_inbox')
    .update({ is_read: true } as UpdateEngagementInboxItem)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as EngagementInboxItem;
}

export async function createEngagementInboxItem(item: NewEngagementInboxItem) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('engagement_inbox')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data as EngagementInboxItem;
}

// ============================================================
// ENGAGEMENT REPLIES
// ============================================================

export async function getRepliesForInboxItem(inboxItemId: string) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('engagement_replies')
    .select('*')
    .eq('inbox_item_id', inboxItemId)
    .order('sent_at', { ascending: true });
  if (error) throw error;
  return data as EngagementReply[];
}

export async function createEngagementReply(reply: NewEngagementReply) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('engagement_replies')
    .insert(reply)
    .select()
    .single();
  if (error) throw error;
  return data as EngagementReply;
}

// ============================================================
// AI GENERATION HISTORY
// ============================================================

export async function getAiGenerationHistory(limit = 50) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('ai_generation_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as AiGenerationHistory[];
}

export async function createAiGenerationRecord(record: NewAiGenerationHistory) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('ai_generation_history')
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data as AiGenerationHistory;
}

// ============================================================
// NEWSLETTER SOURCES
// ============================================================

export async function getNewsletterSources(activeOnly = true) {
  const db = supabaseBrowser();
  let query = db.from('newsletter_sources').select('*').order('name');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as NewsletterSource[];
}

export async function createNewsletterSource(source: NewNewsletterSource) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('newsletter_sources')
    .insert(source)
    .select()
    .single();
  if (error) throw error;
  return data as NewsletterSource;
}

export async function updateNewsletterSource(
  id: string,
  updates: Partial<Pick<NewsletterSource, 'name' | 'url' | 'is_active'>>
) {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('newsletter_sources')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NewsletterSource;
}

export async function deleteNewsletterSource(id: string) {
  const db = supabaseBrowser();
  const { error } = await db.from('newsletter_sources').delete().eq('id', id);
  if (error) throw error;
}
