// Typed Supabase helper functions for the Workspace module
// Uses the browser Supabase client. Mirrors social-media-queries.ts pattern.

import { supabaseBrowser } from '@/src/lib/supabase/browser';
import type {
  ConnectedAccount,
  AiDetectedProject,
  Email,
  EmailAttachment,
  CalendarEvent,
  EmailFolder,
  EmailSignature,
  EmailDraft,
  Conversation,
  DraftAttachment,
  EmailUserState,
  NewEmailSignature,
  UpdateEmailSignature,
  Commitment,
  Topic,
  TopicItem,
  ScheduleItem,
  LessonLearned,
  AskQuery,
  DailyDigest,
  WorkspaceListItem,
  WorkspaceStats,
  UpdateConnectedAccount,
  UpdateAiDetectedProject,
  UpdateCommitment,
  UpdateLessonLearned,
  NewLessonLearned,
  TriageCategory,
  CommitmentStatus,
  CommitmentOwner,
  TopicStatus,
  ScheduleItemStatus,
} from '@/src/lib/types/workspace';

// ============================================================
// CONNECTED ACCOUNTS
// ============================================================

export async function listUserWorkspaces(): Promise<WorkspaceListItem[]> {
  const db = supabaseBrowser();
  const { data, error } = await db.rpc('list_user_workspaces');
  if (error) throw error;
  return data as WorkspaceListItem[];
}

export async function getWorkspace(accountId: string): Promise<ConnectedAccount | null> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('connected_accounts')
    .select('*')
    .eq('id', accountId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ConnectedAccount;
}

export async function updateWorkspace(accountId: string, updates: UpdateConnectedAccount): Promise<ConnectedAccount> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('connected_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .select()
    .single();
  if (error) throw error;
  return data as ConnectedAccount;
}

export async function archiveWorkspace(accountId: string): Promise<ConnectedAccount> {
  return updateWorkspace(accountId, { is_active: false });
}

export async function reorderWorkspaces(positions: { id: string; sidebar_position: number }[]): Promise<void> {
  const db = supabaseBrowser();
  for (const pos of positions) {
    const { error } = await db
      .from('connected_accounts')
      .update({ sidebar_position: pos.sidebar_position, updated_at: new Date().toISOString() })
      .eq('id', pos.id);
    if (error) throw error;
  }
}

// ============================================================
// WORKSPACE STATS (RPC)
// ============================================================

export async function getWorkspaceStats(accountId: string): Promise<WorkspaceStats> {
  const db = supabaseBrowser();
  const { data, error } = await db.rpc('get_workspace_stats', { p_account_id: accountId });
  if (error) throw error;
  return data as WorkspaceStats;
}

// ============================================================
// AI DETECTED PROJECTS
// ============================================================

export async function listProjects(
  accountId: string,
  opts?: { includeArchived?: boolean }
): Promise<AiDetectedProject[]> {
  const db = supabaseBrowser();
  let query = db
    .from('ai_detected_projects')
    .select('*')
    .eq('account_id', accountId)
    .order('last_activity_at', { ascending: false, nullsFirst: false });
  if (!opts?.includeArchived) {
    query = query.neq('status', 'archived');
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as AiDetectedProject[];
}

export async function updateProject(projectId: string, updates: UpdateAiDetectedProject): Promise<AiDetectedProject> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('ai_detected_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select()
    .single();
  if (error) throw error;
  return data as AiDetectedProject;
}

export async function confirmProject(projectId: string): Promise<AiDetectedProject> {
  return updateProject(projectId, { is_user_confirmed: true });
}

export async function archiveProject(projectId: string): Promise<AiDetectedProject> {
  return updateProject(projectId, { status: 'archived' });
}

// ============================================================
// EMAILS
// ============================================================

export async function listEmails(
  accountId: string,
  opts?: {
    projectId?: string | null;
    folderId?: string;
    triageCategory?: TriageCategory;
    isRead?: boolean;
    isPromotional?: boolean;
    userState?: 'handled' | 'followup';
    limit?: number;
    offset?: number;
    search?: string;
  }
): Promise<Email[]> {
  const db = supabaseBrowser();
  let query = db
    .from('emails')
    .select('*')
    .eq('account_id', accountId)
    .order('sent_at', { ascending: false });

  if (opts?.projectId !== undefined) {
    if (opts.projectId === null) {
      query = query.is('ai_project_id', null);
    } else {
      query = query.eq('ai_project_id', opts.projectId);
    }
  }
  if (opts?.folderId) {
    query = query.eq('folder_id', opts.folderId);
  }
  if (opts?.triageCategory) {
    query = query.eq('triage_category', opts.triageCategory);
  }
  if (opts?.userState) {
    query = query.eq('user_state', opts.userState);
  }
  if (opts?.isRead !== undefined) {
    query = query.eq('is_read', opts.isRead);
  }
  if (opts?.isPromotional !== undefined) {
    query = query.eq('is_promotional', opts.isPromotional);
  }
  if (opts?.search) {
    const term = `%${opts.search}%`;
    query = query.or(`subject.ilike.${term},from_name.ilike.${term},snippet.ilike.${term}`);
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }
  if (opts?.offset) {
    query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Email[];
}

export async function getEmail(emailId: string): Promise<Email | null> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('emails')
    .select('*')
    .eq('id', emailId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Email;
}

export async function markEmailRead(emailId: string, isRead: boolean): Promise<void> {
  const db = supabaseBrowser();
  const { error } = await db
    .from('emails')
    .update({ is_read: isRead, updated_at: new Date().toISOString() })
    .eq('id', emailId);
  if (error) throw error;
}

export async function starEmail(emailId: string, isStarred: boolean): Promise<void> {
  const db = supabaseBrowser();
  const { error } = await db
    .from('emails')
    .update({ is_starred: isStarred, updated_at: new Date().toISOString() })
    .eq('id', emailId);
  if (error) throw error;
}

export async function listEmailAttachmentsForEmail(emailId: string): Promise<EmailAttachment[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_attachments')
    .select('*')
    .eq('email_id', emailId)
    .order('file_name', { ascending: true });
  if (error) throw error;
  return data as EmailAttachment[];
}

/**
 * Phase 7: emails from a specific sender, newest first.
 * Used by the add-in's sender context panel.
 */
export async function listEmailsFromSender(
  accountId: string,
  fromAddress: string,
  options: { limit?: number } = {},
): Promise<Email[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('emails')
    .select('*')
    .eq('account_id', accountId)
    .ilike('from_address', fromAddress.toLowerCase())
    .order('received_at', { ascending: false })
    .limit(options.limit ?? 20);
  if (error) throw error;
  return (data ?? []) as Email[];
}

/**
 * Phase 7: look up a conversation by its thread_id (= Graph conversationId = Office.js conversationId).
 * Returns the conversation + its emails if found.
 */
export async function getConversationByThreadId(
  accountId: string,
  threadId: string,
): Promise<{ conversation: Conversation; emails: Email[] } | null> {
  const db = supabaseBrowser();
  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('provider_thread_id', threadId)
    .maybeSingle();
  if (convErr) throw convErr;
  if (!conv) return null;

  const { data: emails, error: emailErr } = await db
    .from('emails')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('sent_at', { ascending: true });
  if (emailErr) throw emailErr;

  return { conversation: conv as Conversation, emails: (emails ?? []) as Email[] };
}

export async function setEmailUserState(
  emailId: string,
  userState: EmailUserState | null,
  options?: { followupDueAt?: Date | null; snoozedUntil?: Date | null }
): Promise<void> {
  const db = supabaseBrowser();
  const { error } = await db
    .from('emails')
    .update({
      user_state: userState,
      handled_at: userState === 'handled' ? new Date().toISOString() : null,
      followup_due_at: options?.followupDueAt?.toISOString() ?? null,
      snoozed_until: options?.snoozedUntil?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', emailId);
  if (error) throw error;
}

// ============================================================
// CONVERSATIONS
// ============================================================

export async function listConversations(accountId: string, opts: {
  folderId?: string;
  userState?: EmailUserState | 'all';
  projectId?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Conversation[]> {
  const db = supabaseBrowser();
  let query = db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false });

  if (opts.folderId) query = query.eq('primary_folder_id', opts.folderId);
  if (opts.userState && opts.userState !== 'all') {
    query = query.eq('user_state', opts.userState);
    if (opts.userState === 'inbox') {
      const now = new Date().toISOString();
      query = query.or(`snoozed_until.is.null,snoozed_until.lt.${now}`);
    }
  }
  if (opts.search) query = query.ilike('subject', `%${opts.search}%`);
  query = query.limit(opts.limit ?? 50);
  if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = supabaseBrowser();
  const { data, error } = await db.from('conversations').select('*').eq('id', id).single();
  if (error) return null;
  return data as Conversation;
}

export async function listEmailsInConversation(conversationId: string): Promise<Email[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('emails')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Email[];
}

export async function setConversationUserState(
  conversationId: string,
  userState: EmailUserState | null,
  options?: { followupDueAt?: Date | null; snoozedUntil?: Date | null }
): Promise<void> {
  const db = supabaseBrowser();
  const now = new Date().toISOString();
  const updates = {
    user_state: userState,
    handled_at: userState === 'handled' ? now : null,
    followup_due_at: options?.followupDueAt?.toISOString() ?? null,
    snoozed_until: options?.snoozedUntil?.toISOString() ?? null,
    updated_at: now,
  };
  const { error: convErr } = await db.from('conversations').update(updates).eq('id', conversationId);
  if (convErr) throw convErr;
  // Cascade to emails
  const emailUpdates = {
    user_state: userState,
    handled_at: userState === 'handled' ? now : null,
    followup_due_at: options?.followupDueAt?.toISOString() ?? null,
    snoozed_until: options?.snoozedUntil?.toISOString() ?? null,
    updated_at: now,
  };
  const { error: emailErr } = await db.from('emails').update(emailUpdates).eq('conversation_id', conversationId);
  if (emailErr) throw emailErr;
}

// ============================================================
// DRAFT ATTACHMENTS
// ============================================================

export async function listDraftAttachments(draftId: string): Promise<DraftAttachment[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('draft_attachments')
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DraftAttachment[];
}

// ============================================================
// EMAIL FOLDERS
// ============================================================

export async function listEmailFolders(accountId: string): Promise<EmailFolder[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_folders')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_hidden', false)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmailFolder[];
}

export async function getFolderCounts(accountId: string): Promise<Record<string, { total: number; unread: number }>> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('conversations')
    .select('primary_folder_id, unread_count')
    .eq('account_id', accountId);
  if (error) throw error;
  const counts: Record<string, { total: number; unread: number }> = {};
  for (const row of data ?? []) {
    const fid = row.primary_folder_id ?? '__none__';
    if (!counts[fid]) counts[fid] = { total: 0, unread: 0 };
    counts[fid].total++;
    if ((row.unread_count as number) > 0) counts[fid].unread++;
  }
  return counts;
}

// ============================================================
// EMAIL SIGNATURES
// ============================================================

export async function listSignatures(accountId: string): Promise<EmailSignature[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_signatures')
    .select('*')
    .eq('account_id', accountId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmailSignature[];
}

export async function createSignature(sig: NewEmailSignature): Promise<EmailSignature> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_signatures')
    .insert(sig)
    .select()
    .single();
  if (error) throw error;
  return data as EmailSignature;
}

export async function updateSignature(id: string, updates: UpdateEmailSignature): Promise<EmailSignature> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_signatures')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as EmailSignature;
}

export async function deleteSignature(id: string): Promise<void> {
  const db = supabaseBrowser();
  const { error } = await db.from('email_signatures').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// EMAIL DRAFTS
// ============================================================

export async function listDrafts(accountId: string): Promise<EmailDraft[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_drafts')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmailDraft[];
}

export async function upsertDraft(draft: Omit<EmailDraft, 'created_at' | 'updated_at'>): Promise<EmailDraft> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('email_drafts')
    .upsert({ ...draft, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as EmailDraft;
}

export async function deleteDraftById(id: string): Promise<void> {
  const db = supabaseBrowser();
  const { error } = await db.from('email_drafts').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// COMMITMENTS
// ============================================================

export async function listCommitments(
  accountId: string,
  opts?: {
    projectId?: string | null;
    status?: CommitmentStatus;
    owner?: CommitmentOwner;
  }
): Promise<Commitment[]> {
  const db = supabaseBrowser();
  let query = db
    .from('commitments')
    .select('*')
    .eq('account_id', accountId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (opts?.projectId !== undefined) {
    if (opts.projectId === null) {
      query = query.is('ai_project_id', null);
    } else {
      query = query.eq('ai_project_id', opts.projectId);
    }
  }
  if (opts?.status) {
    query = query.eq('status', opts.status);
  }
  if (opts?.owner) {
    query = query.eq('owner', opts.owner);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Commitment[];
}

export async function updateCommitment(commitmentId: string, updates: UpdateCommitment): Promise<Commitment> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('commitments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', commitmentId)
    .select()
    .single();
  if (error) throw error;
  return data as Commitment;
}

export async function fulfillCommitment(commitmentId: string): Promise<Commitment> {
  return updateCommitment(commitmentId, {
    status: 'fulfilled',
    fulfilled_at: new Date().toISOString(),
  });
}

export async function snoozeCommitment(commitmentId: string, until: string): Promise<Commitment> {
  return updateCommitment(commitmentId, {
    status: 'snoozed',
    snoozed_until: until,
  });
}

// ============================================================
// TOPICS
// ============================================================

export async function listTopics(
  accountId: string,
  opts?: { projectId?: string | null; status?: TopicStatus }
): Promise<Topic[]> {
  const db = supabaseBrowser();
  let query = db
    .from('topics')
    .select('*')
    .eq('account_id', accountId)
    .order('last_activity_at', { ascending: false, nullsFirst: false });

  if (opts?.projectId !== undefined) {
    if (opts.projectId === null) {
      query = query.is('ai_project_id', null);
    } else {
      query = query.eq('ai_project_id', opts.projectId);
    }
  }
  if (opts?.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Topic[];
}

export async function getTopicWithItems(topicId: string): Promise<{ topic: Topic; items: TopicItem[] }> {
  const db = supabaseBrowser();
  const { data: topic, error: topicErr } = await db
    .from('topics')
    .select('*')
    .eq('id', topicId)
    .single();
  if (topicErr) throw topicErr;

  const { data: items, error: itemsErr } = await db
    .from('topic_items')
    .select('*')
    .eq('topic_id', topicId)
    .order('relevance_score', { ascending: false, nullsFirst: false });
  if (itemsErr) throw itemsErr;

  return { topic: topic as Topic, items: items as TopicItem[] };
}

// ============================================================
// CALENDAR EVENTS
// ============================================================

export async function listCalendarEvents(
  accountId: string,
  opts: { startDate: Date; endDate: Date; projectId?: string | null }
): Promise<CalendarEvent[]> {
  const db = supabaseBrowser();
  let query = db
    .from('calendar_events')
    .select('*')
    .eq('account_id', accountId)
    .gte('start_at', opts.startDate.toISOString())
    .lte('start_at', opts.endDate.toISOString())
    .order('start_at', { ascending: true });

  if (opts.projectId) {
    query = query.eq('ai_project_id', opts.projectId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CalendarEvent[];
}

export async function getCalendarEvent(eventId: string): Promise<CalendarEvent | null> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (error) return null;
  return data as CalendarEvent;
}

// ============================================================
// SCHEDULE ITEMS
// ============================================================

export async function listScheduleItems(
  accountId: string,
  opts?: { projectId?: string | null; status?: ScheduleItemStatus }
): Promise<ScheduleItem[]> {
  const db = supabaseBrowser();
  let query = db
    .from('schedule_items')
    .select('*')
    .eq('account_id', accountId)
    .order('milestone_date', { ascending: true, nullsFirst: false });

  if (opts?.projectId !== undefined) {
    if (opts.projectId === null) {
      query = query.is('ai_project_id', null);
    } else {
      query = query.eq('ai_project_id', opts.projectId);
    }
  }
  if (opts?.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as ScheduleItem[];
}

// ============================================================
// LESSONS LEARNED
// ============================================================

export async function listLessons(
  accountId: string,
  opts?: { projectId?: string | null }
): Promise<LessonLearned[]> {
  const db = supabaseBrowser();
  let query = db
    .from('lessons_learned')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (opts?.projectId !== undefined) {
    if (opts.projectId === null) {
      query = query.is('ai_project_id', null);
    } else {
      query = query.eq('ai_project_id', opts.projectId);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as LessonLearned[];
}

export async function createLesson(payload: NewLessonLearned): Promise<LessonLearned> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('lessons_learned')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as LessonLearned;
}

export async function updateLesson(id: string, updates: UpdateLessonLearned): Promise<LessonLearned> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('lessons_learned')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as LessonLearned;
}

// ============================================================
// ASK QUERIES (history)
// ============================================================

export async function listRecentAskQueries(
  opts?: { accountId?: string; limit?: number }
): Promise<AskQuery[]> {
  const db = supabaseBrowser();
  let query = db
    .from('ask_queries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 20);

  if (opts?.accountId) {
    query = query.eq('account_id', opts.accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as AskQuery[];
}

// ============================================================
// DAILY DIGESTS
// ============================================================

export async function getTodayDigest(accountId: string): Promise<DailyDigest | null> {
  const db = supabaseBrowser();
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db
    .from('daily_digests')
    .select('*')
    .eq('account_id', accountId)
    .eq('digest_date', today)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as DailyDigest;
}

// ============================================================
// SEMANTIC SEARCH (Phase 8a)
// ============================================================

/**
 * Search emails semantically using the existing match_workspace_embeddings RPC.
 * Caller must provide the pre-computed query embedding vector.
 */
export async function searchEmailsSemantic(
  queryEmbedding: number[],
  options: { matchThreshold?: number; matchCount?: number } = {},
) {
  const db = supabaseBrowser();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await db.rpc('match_workspace_embeddings', {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_user_id: user.id,
    match_count: options.matchCount ?? 15,
    similarity_threshold: options.matchThreshold ?? 0.65,
    filter_source_types: ['email'],
  });
  if (error) throw error;
  return data ?? [];
}
