/**
 * /api/cron/engagement
 *
 * Runs every 30 minutes via Vercel Cron.
 * Fetches new comments, mentions, and reviews from each connected platform
 * and upserts them into engagement_inbox (deduplication by platform_item_id).
 *
 * Flow:
 *   1. Load connected social_platforms and recent cron_post_log entries (last 30 days).
 *   2. For each platform, fetch engagement items using platform API.
 *   3. Upsert into engagement_inbox — existing records are left unchanged
 *      (only inserts new items, preserving is_read / is_replied state).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/src/lib/supabase/admin';
import {
  fetchInstagramEngagement,
  fetchFacebookEngagement,
  fetchLinkedInEngagement,
  fetchGoogleBusinessEngagement,
} from '@/src/lib/platforms/fetch-engagement';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const secret = new URL(request.url).searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  if (!isVercelCron && (!cronSecret || secret !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── Load connected platforms + recent post IDs ─────────────────────────
  const { data: platforms } = await supabase
    .from('social_platforms')
    .select('id, platform_name')
    .eq('is_connected', true);

  const platformMap: Record<string, string> = {};
  for (const p of platforms ?? []) {
    platformMap[p.platform_name] = p.id;
  }

  // Get platform_post_ids published in the last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await supabase
    .from('cron_post_log')
    .select('platform, platform_post_id')
    .eq('status', 'success')
    .not('platform_post_id', 'is', null)
    .gte('attempted_at', since);

  const postIdsByPlatform: Record<string, string[]> = {};
  for (const log of logs ?? []) {
    if (!log.platform_post_id) continue;
    postIdsByPlatform[log.platform] ??= [];
    postIdsByPlatform[log.platform].push(log.platform_post_id);
  }

  // ── Fetch engagement from each platform ──────────────────────────────────
  const [instagramItems, facebookItems, linkedinItems, googleItems] = await Promise.all([
    fetchInstagramEngagement(postIdsByPlatform.instagram ?? []),
    fetchFacebookEngagement(postIdsByPlatform.facebook ?? []),
    fetchLinkedInEngagement(postIdsByPlatform.linkedin ?? []),
    fetchGoogleBusinessEngagement(),
  ]);

  const allItems = [
    ...instagramItems.map((i) => ({ ...i, platform: 'instagram' })),
    ...facebookItems.map((i) => ({ ...i, platform: 'facebook' })),
    ...linkedinItems.map((i) => ({ ...i, platform: 'linkedin' })),
    ...googleItems.map((i) => ({ ...i, platform: 'google_business' })),
  ];

  let inserted = 0;
  let skipped = 0;

  for (const item of allItems) {
    const platformId = platformMap[item.platform];
    if (!platformId) { skipped++; continue; }

    // Resolve the content_posts.id from the platform_post_id if available
    let parentPostId: string | null = null;
    if (item.parent_platform_post_id) {
      const { data: logRow } = await supabase
        .from('cron_post_log')
        .select('post_id')
        .eq('platform_post_id', item.parent_platform_post_id)
        .maybeSingle();
      parentPostId = logRow?.post_id ?? null;
    }

    const { error } = await supabase
      .from('engagement_inbox')
      .upsert(
        {
          platform_id: platformId,
          platform_item_id: item.platform_item_id,
          type: item.type,
          author_name: item.author_name,
          author_avatar_url: item.author_avatar_url,
          author_platform_id: item.author_platform_id,
          content: item.content,
          parent_post_id: parentPostId,
          is_read: false,
          is_replied: false,
          received_at: item.received_at,
        },
        {
          onConflict: 'platform_item_id',
          ignoreDuplicates: true, // Don't overwrite is_read/is_replied on existing rows
        }
      );

    if (error) { skipped++; } else { inserted++; }
  }

  return NextResponse.json({ inserted, skipped, total: allItems.length });
}
