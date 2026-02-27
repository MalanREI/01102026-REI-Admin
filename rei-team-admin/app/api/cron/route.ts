/**
 * /api/cron — Automated content posting engine
 *
 * Invoked by Vercel Cron (GET) every 5 minutes.  For each content schedule
 * whose `next_run_at` is in the past it:
 *
 *   1. Posts the content to every target platform via `postToPlatform`.
 *   2. Writes a row to `cron_post_log` for each platform attempt.
 *   3. If all platforms succeed → sets the post status to `published` and
 *      advances (or deactivates) the schedule.
 *   4. If any platform fails → leaves the post status unchanged, logs the
 *      error, and inserts a `post_failed` notification for every admin/manager
 *      team member so they can investigate.
 *
 * Security:
 *   - Requests from Vercel Cron carry the `x-vercel-cron: 1` header.
 *   - Additionally, set CRON_SECRET in your Vercel environment and pass it as
 *     `?secret=<value>` from non-Vercel callers (e.g. local dev).
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/src/lib/supabase/admin';
import {
  queryDueScheduledPosts,
  computeNextRunAt,
} from '@/src/lib/supabase/query-scheduled-posts';
import {
  postToPlatform,
  type PlatformPostPayload,
  type PlatformPostResult,
  type PlatformCredentials,
} from '@/src/lib/platforms/post-to-platform';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface CronRunSummary {
  processed: number;
  published: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const secret = process.env.CRON_SECRET;
  const provided = new URL(req.url).searchParams.get('secret');
  if (!isVercelCron && secret && provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary: CronRunSummary = {
    processed: 0,
    published: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const admin = supabaseAdmin();
    const now = new Date().toISOString();

    // ── 1. Query schedules due for posting ──────────────────────────────────
    const duePosts = await queryDueScheduledPosts(now);

    if (duePosts.length === 0) {
      return NextResponse.json({ ok: true, ...summary });
    }

    // ── 2. Load stored OAuth tokens from social_platforms ───────────────────
    const { data: connectedPlatforms } = await admin
      .from('social_platforms')
      .select('platform_name, access_token, account_id, metadata')
      .eq('is_connected', true);

    const credentialsMap: Record<string, PlatformCredentials> = {};
    for (const p of connectedPlatforms ?? []) {
      credentialsMap[p.platform_name] = {
        accessToken: p.access_token,
        accountId: p.account_id,
        authorUrn: (p.metadata as Record<string, string> | null)?.author_urn,
      };
    }

    // ── 3. Process each due schedule ────────────────────────────────────────
    for (const row of duePosts) {
      summary.processed++;
      const post = row.post;
      const platforms = post.target_platforms ?? [];

      if (platforms.length === 0) {
        summary.skipped++;
        continue;
      }

      const payload: PlatformPostPayload = {
        postId: post.id,
        body: post.body,
        title: post.title,
        mediaUrls: post.media_urls,
        platformSpecificContent: post.platform_specific_content,
      };

      // ── 4. Post to each platform using stored OAuth credentials ───────────
      const results: PlatformPostResult[] = await Promise.all(
        platforms.map((platform) =>
          postToPlatform(
            platform,
            { ...payload, body: post.platform_specific_content?.[platform] ?? post.body },
            credentialsMap[platform]
          )
        )
      );

      // ── 5. Write to cron_post_log ─────────────────────────────────────────
      const logRows = results.map((r) => ({
        schedule_id: row.id,
        post_id: post.id,
        platform: r.platform,
        status: r.success ? 'success' : 'failed',
        platform_post_id: r.platformPostId,
        error_message: r.error,
        attempted_at: now,
      }));

      await admin.from('cron_post_log').insert(logRows);

      const allSucceeded = results.every((r) => r.success);
      const anyFailed = results.some((r) => !r.success);

      // ── 6. Update post status + schedule ─────────────────────────────────
      if (allSucceeded) {
        // Mark the post as published
        await admin
          .from('content_posts')
          .update({ status: 'published', updated_at: now })
          .eq('id', post.id);

        // Advance or deactivate the schedule
        const nextRunAt = computeNextRunAt(
          row.schedule_type,
          row.recurrence_rule,
          row.recurrence_end_date,
          now
        );

        await admin
          .from('content_schedules')
          .update({
            last_run_at: now,
            next_run_at: nextRunAt,
            is_active: nextRunAt !== null,
            updated_at: now,
          })
          .eq('id', row.id);

        summary.published++;
      } else if (anyFailed) {
        // Keep the schedule active for retry; bump last_run_at so it isn't
        // re-triggered until the next cron window.
        const failedPlatforms = results
          .filter((r) => !r.success)
          .map((r) => `${r.platform}: ${r.error}`)
          .join('; ');

        summary.failed++;
        summary.errors.push(`Post ${post.id}: ${failedPlatforms}`);

        // Count recent failures to enforce a retry limit.
        // After MAX_RETRIES consecutive failures the schedule is deactivated so
        // it doesn't keep firing every 5 minutes indefinitely.
        const MAX_RETRIES = 5;
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: failCount } = await admin
          .from('cron_post_log')
          .select('id', { count: 'exact', head: true })
          .eq('schedule_id', row.id)
          .eq('status', 'failed')
          .gte('attempted_at', oneDayAgo);

        const exhausted = (failCount ?? 0) >= MAX_RETRIES;

        // Update last_run_at to now so it won't be picked up again this cycle;
        // deactivate if the retry limit has been reached.
        await admin
          .from('content_schedules')
          .update({ last_run_at: now, updated_at: now, is_active: !exhausted })
          .eq('id', row.id);

        // ── 7. Notify admins/managers of failure ───────────────────────────
        await notifyFailure(admin, post.id);
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'cron failed', ...summary },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Insert a `post_failed` notification for every active admin/manager so they
 * are aware of the posting failure via the app's notification centre.
 */
async function notifyFailure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: ReturnType<typeof supabaseAdmin>,
  postId: string
): Promise<void> {
  const { data: recipients } = await admin
    .from('team_members')
    .select('id')
    .in('role', ['admin', 'manager'])
    .eq('is_active', true);

  if (!recipients?.length) return;

  const notifications = recipients.map((r: { id: string }) => ({
    recipient_id: r.id,
    actor_id: null,
    post_id: postId,
    type: 'post_failed' as const,
    is_read: false,
  }));

  await admin.from('notifications').insert(notifications);
}
