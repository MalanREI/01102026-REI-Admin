/**
 * /api/analytics
 *
 * Returns aggregated analytics data for the dashboard.
 *
 * GET ?days=30&platform=instagram
 *   → Returns summary stats + top posts + per-platform breakdown
 *     for the last N days, optionally filtered by platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const days = parseInt(searchParams.get('days') ?? '30', 10);
  const platform = searchParams.get('platform') ?? null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Build query
  let query = supabase
    .from('analytics_snapshots')
    .select(
      `
      id,
      post_id,
      platform_id,
      snapshot_date,
      impressions,
      reach,
      likes,
      comments_count,
      shares,
      saves,
      clicks,
      engagement_rate,
      social_platforms!inner ( platform_name ),
      content_posts!inner ( title, body )
    `
    )
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: false });

  if (platform) {
    query = query.eq('social_platforms.platform_name', platform);
  }

  const { data: snapshots, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Aggregate summary ─────────────────────────────────────────────────────
  const totalImpressions = snapshots?.reduce((s, r) => s + (r.impressions ?? 0), 0) ?? 0;
  const totalReach = snapshots?.reduce((s, r) => s + (r.reach ?? 0), 0) ?? 0;
  const totalLikes = snapshots?.reduce((s, r) => s + (r.likes ?? 0), 0) ?? 0;
  const totalComments = snapshots?.reduce((s, r) => s + (r.comments_count ?? 0), 0) ?? 0;
  const totalShares = snapshots?.reduce((s, r) => s + (r.shares ?? 0), 0) ?? 0;
  const avgEngagement =
    snapshots && snapshots.length > 0
      ? parseFloat(
          (
            snapshots.reduce((s, r) => s + (r.engagement_rate ?? 0), 0) / snapshots.length
          ).toFixed(2)
        )
      : 0;

  // ── Per-platform breakdown ────────────────────────────────────────────────
  const byPlatform: Record<
    string,
    { impressions: number; reach: number; engagement_rate: number; posts: number }
  > = {};

  for (const row of snapshots ?? []) {
    const name = (row.social_platforms as unknown as { platform_name: string })?.platform_name;
    if (!name) continue;
    if (!byPlatform[name]) {
      byPlatform[name] = { impressions: 0, reach: 0, engagement_rate: 0, posts: 0 };
    }
    byPlatform[name].impressions += row.impressions ?? 0;
    byPlatform[name].reach += row.reach ?? 0;
    byPlatform[name].engagement_rate += row.engagement_rate ?? 0;
    byPlatform[name].posts += 1;
  }

  // Average engagement rate per platform
  for (const p of Object.keys(byPlatform)) {
    byPlatform[p].engagement_rate = parseFloat(
      (byPlatform[p].engagement_rate / byPlatform[p].posts).toFixed(2)
    );
  }

  // ── Top 5 posts by engagement rate ────────────────────────────────────────
  const topPosts = [...(snapshots ?? [])]
    .sort((a, b) => (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0))
    .slice(0, 5)
    .map((r) => ({
      post_id: r.post_id,
      title: (r.content_posts as unknown as { title: string | null; body: string })?.title ?? null,
      body: (r.content_posts as unknown as { title: string | null; body: string })?.body ?? '',
      platform: (r.social_platforms as unknown as { platform_name: string })?.platform_name,
      engagement_rate: r.engagement_rate ?? 0,
      impressions: r.impressions ?? 0,
      likes: r.likes ?? 0,
    }));

  return NextResponse.json({
    summary: {
      totalImpressions,
      totalReach,
      totalLikes,
      totalComments,
      totalShares,
      avgEngagementRate: avgEngagement,
      snapshotCount: snapshots?.length ?? 0,
    },
    byPlatform,
    topPosts,
    days,
  });
}
