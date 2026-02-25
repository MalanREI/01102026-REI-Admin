/**
 * query-scheduled-posts.ts
 * Server-side query helpers for the cron posting engine.
 *
 * Uses the Supabase admin client (service-role key) so it bypasses RLS and can
 * read every active schedule regardless of the calling user's session.
 */

import { supabaseAdmin } from '@/src/lib/supabase/admin';
import type { ContentScheduleWithPost } from '@/src/lib/types/social-media';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ScheduledPostRow extends ContentScheduleWithPost {
  post: NonNullable<ContentScheduleWithPost['post']>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Return all active schedules whose `next_run_at` is at or before `asOf`
 * and whose associated post is in a publishable status (`scheduled` or `approved`).
 *
 * @param asOf  ISO timestamp to compare against next_run_at.  Defaults to now.
 */
export async function queryDueScheduledPosts(asOf?: string): Promise<ScheduledPostRow[]> {
  const admin = supabaseAdmin();
  const cutoff = asOf ?? new Date().toISOString();

  const { data, error } = await admin
    .from('content_schedules')
    .select('*, post:content_posts(*)')
    .eq('is_active', true)
    .lte('next_run_at', cutoff)
    .order('next_run_at', { ascending: true });

  if (error) throw error;

  // Filter to only rows where the post exists and is publishable
  return (data ?? []).filter(
    (row): row is ScheduledPostRow =>
      row.post != null &&
      (row.post.status === 'scheduled' || row.post.status === 'approved')
  );
}

/**
 * Compute the next run timestamp for a schedule after a successful run.
 *
 * - `one_time`  → returns null (no future run)
 * - `recurring` → parses `recurrence_rule` as a simple interval string
 *   (e.g. "1h", "24h", "7d") and advances from `lastRunAt`.
 *   Falls back to null if the rule cannot be parsed or the end date has passed.
 */
export function computeNextRunAt(
  scheduleType: 'one_time' | 'recurring',
  recurrenceRule: string | null,
  recurrenceEndDate: string | null,
  lastRunAt: string
): string | null {
  if (scheduleType === 'one_time') return null;

  if (!recurrenceRule) return null;

  const last = new Date(lastRunAt);
  const intervalMs = parseRecurrenceRule(recurrenceRule);
  if (!intervalMs) return null;

  const next = new Date(last.getTime() + intervalMs);

  // Don't schedule past the recurrence end date
  if (recurrenceEndDate && next > new Date(recurrenceEndDate)) return null;

  return next.toISOString();
}

/**
 * Parse simple interval strings such as:
 *   "30m"  → 30 minutes
 *   "1h"   → 1 hour
 *   "24h"  → 24 hours
 *   "7d"   → 7 days
 *   "2w"   → 2 weeks
 *
 * Returns milliseconds, or null if the string isn't recognised.
 */
function parseRecurrenceRule(rule: string): number | null {
  const match = rule.trim().match(/^(\d+(?:\.\d+)?)\s*(m|h|d|w)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  switch (match[2].toLowerCase()) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default:  return null;
  }
}
