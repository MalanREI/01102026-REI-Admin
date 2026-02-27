/**
 * fetch-analytics.ts
 * Fetches per-post performance metrics from each social platform's API.
 *
 * Each function accepts the platform_post_id (the ID assigned by the platform
 * after publishing) and optional credentials from the `social_platforms` DB
 * row, and returns a partial AnalyticsSnapshot ready to be upserted into the
 * analytics_snapshots table.
 *
 * If credentials are absent, functions fall back to env vars for dev, then
 * return null so callers can skip silently.
 */

import type { PlatformCredentials } from './post-to-platform';

export interface PlatformAnalytics {
  impressions: number;
  reach: number;
  likes: number;
  comments_count: number;
  shares: number;
  saves: number;
  clicks: number;
  engagement_rate: number;
  follower_count_at_time: number;
  raw_data: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Instagram — Insights API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchInstagramAnalytics(
  platformPostId: string,
  credentials?: PlatformCredentials
): Promise<PlatformAnalytics | null> {
  const token = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const metrics = 'impressions,reach,likes,comments,shares,saved';
    const res = await fetch(
      `https://graph.instagram.com/v18.0/${platformPostId}/insights` +
        `?metric=${metrics}&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    const values: Record<string, number> = {};
    for (const item of data.data ?? []) {
      values[item.name] = item.values?.[0]?.value ?? 0;
    }

    const likes = values.likes ?? 0;
    const comments = values.comments ?? 0;
    const shares = values.shares ?? 0;
    const saves = values.saved ?? 0;
    const reach = values.reach ?? 0;
    const total = likes + comments + shares + saves;
    const rate = reach > 0 ? parseFloat(((total / reach) * 100).toFixed(2)) : 0;

    return {
      impressions: values.impressions ?? 0,
      reach,
      likes,
      comments_count: comments,
      shares,
      saves,
      clicks: 0,
      engagement_rate: rate,
      follower_count_at_time: 0,
      raw_data: data,
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Facebook — Post Insights API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchFacebookAnalytics(
  platformPostId: string,
  credentials?: PlatformCredentials
): Promise<PlatformAnalytics | null> {
  const token = credentials?.accessToken ?? process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const metrics =
      'post_impressions,post_reach,post_reactions_by_type_total,post_clicks,post_activity_by_action_type';
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${platformPostId}/insights` +
        `?metric=${metrics}&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    const values: Record<string, unknown> = {};
    for (const item of data.data ?? []) {
      values[item.name] = item.values?.[0]?.value ?? 0;
    }

    const reactions = values.post_reactions_by_type_total as Record<string, number> | undefined;
    const likes = reactions
      ? Object.values(reactions).reduce((a, b) => a + b, 0)
      : 0;

    const activity = values.post_activity_by_action_type as Record<string, number> | undefined;
    const comments = activity?.comment ?? 0;
    const shares = activity?.share ?? 0;
    const reach = (values.post_reach as number) ?? 0;
    const total = likes + comments + shares;
    const rate = reach > 0 ? parseFloat(((total / reach) * 100).toFixed(2)) : 0;

    return {
      impressions: (values.post_impressions as number) ?? 0,
      reach,
      likes,
      comments_count: comments,
      shares,
      saves: 0,
      clicks: (values.post_clicks as number) ?? 0,
      engagement_rate: rate,
      follower_count_at_time: 0,
      raw_data: data,
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// LinkedIn — Share Statistics API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchLinkedInAnalytics(
  platformPostId: string,
  credentials?: PlatformCredentials
): Promise<PlatformAnalytics | null> {
  const token = credentials?.accessToken ?? process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = credentials?.authorUrn ?? credentials?.accountId ?? process.env.LINKEDIN_AUTHOR_URN;
  if (!token) return null;

  try {
    // platformPostId is the share URN (e.g. urn:li:share:7145...)
    const shareUrn = encodeURIComponent(platformPostId);
    const res = await fetch(
      `https://api.linkedin.com/v2/organizationalEntityShareStatistics` +
        `?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
          authorUrn ?? ''
        )}&shares[0]=${shareUrn}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const stats = data.elements?.[0]?.totalShareStatistics ?? {};
    const impressions = stats.impressionCount ?? 0;
    const likes = stats.likeCount ?? 0;
    const comments = stats.commentCount ?? 0;
    const shares = stats.shareCount ?? 0;
    const clicks = stats.clickCount ?? 0;
    const total = likes + comments + shares + clicks;
    const rate = impressions > 0 ? parseFloat(((total / impressions) * 100).toFixed(2)) : 0;

    return {
      impressions,
      reach: stats.uniqueImpressionsCount ?? impressions,
      likes,
      comments_count: comments,
      shares,
      saves: 0,
      clicks,
      engagement_rate: rate,
      follower_count_at_time: 0,
      raw_data: data,
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Google Business Profile — Local Post metrics
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchGoogleBusinessAnalytics(
  platformPostId: string,
  credentials?: PlatformCredentials
): Promise<PlatformAnalytics | null> {
  const token = credentials?.accessToken ?? process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  if (!token) return null;

  try {
    // platformPostId is the full resource name (accounts/x/locations/y/localPosts/z)
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${platformPostId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const metrics = data.insights ?? {};
    const impressions = metrics.mediaViewsCount ?? 0;
    const clicks = metrics.callsCount ?? 0 + (metrics.websiteClicksCount ?? 0);

    return {
      impressions,
      reach: impressions,
      likes: 0,
      comments_count: 0,
      shares: 0,
      saves: 0,
      clicks,
      engagement_rate: 0,
      follower_count_at_time: 0,
      raw_data: data,
    };
  } catch {
    return null;
  }
}
