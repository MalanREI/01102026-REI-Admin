// Scheduling-specific Supabase helper functions for the REI Social Media Command Center.
// Uses the browser Supabase client; for server-side use, pass your own client.

import { supabaseBrowser } from '@/src/lib/supabase/browser';
import type {
  ContentSchedule,
  ContentScheduleWithPost,
  CalendarEvent,
  NewContentSchedule,
  UpdateContentSchedule,
  PostStatus,
  PlatformName,
  ScheduleType,
} from '@/src/lib/types/social-media';

// ============================================================
// SCHEDULE CRUD
// ============================================================

/** Fetch all schedules (optionally active-only), joined with their post. */
export async function getSchedules(activeOnly = true): Promise<ContentScheduleWithPost[]> {
  const db = supabaseBrowser();
  let query = db
    .from('content_schedules')
    .select('*, post:content_posts(*)')
    .order('scheduled_at', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as ContentScheduleWithPost[];
}

/** Fetch a single schedule by ID. */
export async function getScheduleById(id: string): Promise<ContentScheduleWithPost> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_schedules')
    .select('*, post:content_posts(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ContentScheduleWithPost;
}

/** Fetch all schedules for a given post. */
export async function getSchedulesForPost(postId: string): Promise<ContentSchedule[]> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_schedules')
    .select('*')
    .eq('post_id', postId)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data as ContentSchedule[];
}

/** Create a new schedule. */
export async function createSchedule(schedule: NewContentSchedule): Promise<ContentSchedule> {
  const db = supabaseBrowser();
  const { data, error } = await db
    .from('content_schedules')
    .insert(schedule)
    .select()
    .single();
  if (error) throw error;
  return data as ContentSchedule;
}

/** Update an existing schedule. */
export async function updateSchedule(
  id: string,
  updates: UpdateContentSchedule
): Promise<ContentSchedule> {
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

/** Soft-delete (deactivate) a schedule. */
export async function deactivateSchedule(id: string): Promise<ContentSchedule> {
  return updateSchedule(id, { is_active: false });
}

/** Hard-delete a schedule. */
export async function deleteSchedule(id: string): Promise<void> {
  const db = supabaseBrowser();
  const { error } = await db.from('content_schedules').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CALENDAR EVENT QUERIES
// ============================================================

/** Options for filtering calendar events. */
export interface CalendarQueryOptions {
  dateFrom?: string;
  dateTo?: string;
  platforms?: PlatformName[];
  statuses?: PostStatus[];
  scheduleType?: ScheduleType;
  activeOnly?: boolean;
}

/**
 * Fetch calendar events: schedules joined with posts, mapped to CalendarEvent shape.
 * dateFrom/dateTo should be ISO strings (date portion, e.g. "2026-02-01").
 */
export async function getCalendarEvents(
  options: CalendarQueryOptions = {}
): Promise<CalendarEvent[]> {
  const db = supabaseBrowser();
  const {
    dateFrom,
    dateTo,
    platforms,
    statuses,
    scheduleType,
    activeOnly = true,
  } = options;

  let query = db
    .from('content_schedules')
    .select('*, post:content_posts(*)')
    .order('scheduled_at', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);

  // Date range filtering on scheduled_at
  if (dateFrom) query = query.gte('scheduled_at', dateFrom);
  if (dateTo) query = query.lte('scheduled_at', dateTo + 'T23:59:59.999Z');

  if (scheduleType) query = query.eq('schedule_type', scheduleType);

  const { data, error } = await query;
  if (error) throw error;

  // Map to CalendarEvent and apply post-level filters
  const events: CalendarEvent[] = [];
  for (const row of data ?? []) {
    const post = row.post;
    if (!post) continue;

    // Filter by status
    if (statuses && statuses.length > 0 && !statuses.includes(post.status)) continue;

    // Filter by platform (target_platforms is a string[])
    if (platforms && platforms.length > 0) {
      const hasMatch = platforms.some((p) => post.target_platforms?.includes(p));
      if (!hasMatch) continue;
    }

    events.push({
      schedule_id: row.id,
      post_id: post.id,
      post_title: post.title,
      post_body: post.body,
      post_status: post.status,
      target_platforms: post.target_platforms ?? [],
      media_type: post.media_type,
      schedule_type: row.schedule_type,
      scheduled_at: row.scheduled_at,
      recurrence_rule: row.recurrence_rule,
      recurrence_end_date: row.recurrence_end_date,
      timezone: row.timezone,
      is_active: row.is_active,
      next_run_at: row.next_run_at,
    });
  }

  return events;
}

// ============================================================
// CRON / RECURRENCE UTILITIES
// ============================================================

/**
 * Very lightweight human-readable label for a cron expression.
 * Supports common patterns; falls back to showing the raw expression.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = parts;

  if (dom === '*' && month === '*' && dow === '*') {
    if (minute === '0' && hour !== '*') return `Daily at ${hour.padStart(2, '0')}:00`;
    if (minute !== '*' && hour !== '*') return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  if (dom === '*' && month === '*' && dow !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[parseInt(dow, 10)];
    if (day && minute !== '*' && hour !== '*')
      return `Weekly on ${day} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  return cron;
}
