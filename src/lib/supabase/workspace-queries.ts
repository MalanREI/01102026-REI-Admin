// Typed Supabase helper functions for the Workspace module
// Uses the browser Supabase client. Mirrors social-media-queries.ts pattern.

import { supabaseBrowser } from '@/src/lib/supabase/browser';
import type {
  ConnectedAccount,
  AiDetectedProject,
  Email,
  EmailAttachment,
  CalendarEvent,
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
    triageCategory?: TriageCategory;
    isRead?: boolean;
    isPromotional?: boolean;
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
  if (opts?.triageCategory) {
    query = query.eq('triage_category', opts.triageCategory);
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
// ASK-CLAUDE (stub — Phase 6)
// ============================================================

export async function askClaude(
  _query: string,
  _opts: { accountId?: string }
): Promise<never> {
  throw new Error('Ask-Claude is not yet wired up — Phase 6.');
}
