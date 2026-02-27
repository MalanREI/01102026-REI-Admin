/**
 * /api/cron/analytics
 *
 * Daily cron job that fetches performance metrics for all published posts
 * and upserts them into the analytics_snapshots table.
 *
 * Triggered by Vercel Cron at 03:00 UTC every day.
 * Protected by x-vercel-cron header (set by Vercel) or ?secret= param.
 *
 * Flow:
 *   1. Query published posts that have a platform_post_id stored in cron_post_log
 *      and were either never fetched or fetched > 24 hours ago.
 *   2. For each post × platform, call the appropriate fetch-analytics function.
 *   3. Upsert the result into analytics_snapshots.
 *   4. Update last_analytics_fetched_at on content_posts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/src/lib/supabase/admin';
import {
  fetchInstagramAnalytics,
  fetchFacebookAnalytics,
  fetchLinkedInAnalytics,
  fetchGoogleBusinessAnalytics,
} from '@/src/lib/platforms/fetch-analytics';
import type { PlatformCredentials } from '@/src/lib/platforms/post-to-platform';

export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const secret = new URL(request.url).searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (!isVercelCron && (!cronSecret || secret !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Find posts needing analytics sync ─────────────────────────────────────
  // Join cron_post_log to get the platform_post_id for each published post
  const { data: logs, error: logsError } = await supabase
    .from('cron_post_log')
    .select('post_id, platform, platform_post_id, schedule_id, content_posts!inner(id, last_analytics_fetched_at)')
    .eq('status', 'success')
    .not('platform_post_id', 'is', null);

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  // Filter to posts that need a refresh
  const toSync = (logs ?? []).filter((log) => {
    const post = log.content_posts as { id: string; last_analytics_fetched_at: string | null } | null;
    if (!post) return false;
    if (!post.last_analytics_fetched_at) return true;
    return post.last_analytics_fetched_at < cutoff;
  });

  // Load connected platforms — IDs for FK references + tokens for API calls
  const { data: platforms } = await supabase
    .from('social_platforms')
    .select('id, platform_name, access_token, account_id, metadata')
    .eq('is_connected', true);

  const platformMap: Record<string, string> = {};
  const credentialsMap: Record<string, PlatformCredentials> = {};
  for (const p of platforms ?? []) {
    platformMap[p.platform_name] = p.id;
    credentialsMap[p.platform_name] = {
      accessToken: p.access_token,
      accountId: p.account_id,
      authorUrn: (p.metadata as Record<string, string> | null)?.author_urn,
    };
  }

  let synced = 0;
  let failed = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const log of toSync) {
    const { post_id, platform, platform_post_id } = log;
    if (!platform_post_id) continue;

    let analytics = null;

    const creds = credentialsMap[platform];
    switch (platform) {
      case 'instagram':
        analytics = await fetchInstagramAnalytics(platform_post_id, creds);
        break;
      case 'facebook':
        analytics = await fetchFacebookAnalytics(platform_post_id, creds);
        break;
      case 'linkedin':
        analytics = await fetchLinkedInAnalytics(platform_post_id, creds);
        break;
      case 'google_business':
        analytics = await fetchGoogleBusinessAnalytics(platform_post_id, creds);
        break;
    }

    if (!analytics) {
      failed++;
      continue;
    }

    const platformId = platformMap[platform];
    if (!platformId) {
      failed++;
      continue;
    }

    // Upsert analytics snapshot (one row per post × platform × date)
    await supabase.from('analytics_snapshots').upsert(
      {
        post_id,
        platform_id: platformId,
        platform_post_id,
        snapshot_date: today,
        impressions: analytics.impressions,
        reach: analytics.reach,
        likes: analytics.likes,
        comments_count: analytics.comments_count,
        shares: analytics.shares,
        saves: analytics.saves,
        clicks: analytics.clicks,
        engagement_rate: analytics.engagement_rate,
        follower_count_at_time: analytics.follower_count_at_time,
        raw_data: analytics.raw_data,
      },
      { onConflict: 'post_id,platform_id,snapshot_date' }
    );

    synced++;
  }

  // Update last_analytics_fetched_at for all synced posts
  const syncedPostIds = [...new Set(toSync.map((l) => l.post_id))];
  if (syncedPostIds.length > 0) {
    await supabase
      .from('content_posts')
      .update({ last_analytics_fetched_at: new Date().toISOString() })
      .in('id', syncedPostIds);
  }

  return NextResponse.json({ synced, failed, total: toSync.length });
}
