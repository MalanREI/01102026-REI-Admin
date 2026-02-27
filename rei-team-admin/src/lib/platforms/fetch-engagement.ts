/**
 * fetch-engagement.ts
 * Fetches comments, mentions, and reviews from each social platform.
 *
 * Each function returns an array of items ready to be upserted into the
 * engagement_inbox table.  platform_item_id is used as the deduplication key.
 *
 * If credentials are absent, functions return an empty array so the cron
 * skips that platform silently.
 */

export interface IncomingEngagementItem {
  platform_item_id: string;
  type: 'comment' | 'dm' | 'mention' | 'review';
  author_name: string;
  author_avatar_url: string | null;
  author_platform_id: string;
  content: string;
  /** The platform_post_id this item is attached to (null for reviews/DMs). */
  parent_platform_post_id: string | null;
  received_at: string; // ISO timestamp
}

// ──────────────────────────────────────────────────────────────────────────────
// Instagram — comments on published media
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchInstagramEngagement(
  platformPostIds: string[]
): Promise<IncomingEngagementItem[]> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token || platformPostIds.length === 0) return [];

  const items: IncomingEngagementItem[] = [];

  for (const mediaId of platformPostIds) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/v18.0/${mediaId}/comments` +
          `?fields=id,text,timestamp,username,replies{id,text,timestamp,username}` +
          `&access_token=${token}`
      );
      if (!res.ok) continue;
      const data = await res.json();

      for (const comment of data.data ?? []) {
        items.push({
          platform_item_id: comment.id,
          type: 'comment',
          author_name: comment.username ?? 'Instagram User',
          author_avatar_url: null,
          author_platform_id: comment.username ?? '',
          content: comment.text ?? '',
          parent_platform_post_id: mediaId,
          received_at: comment.timestamp ?? new Date().toISOString(),
        });
      }
    } catch {
      // Skip failed requests silently
    }
  }

  return items;
}

// ──────────────────────────────────────────────────────────────────────────────
// Facebook — comments on page posts
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchFacebookEngagement(
  platformPostIds: string[]
): Promise<IncomingEngagementItem[]> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token || platformPostIds.length === 0) return [];

  const items: IncomingEngagementItem[] = [];

  for (const postId of platformPostIds) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${postId}/comments` +
          `?fields=id,message,created_time,from{id,name,picture}` +
          `&access_token=${token}`
      );
      if (!res.ok) continue;
      const data = await res.json();

      for (const comment of data.data ?? []) {
        items.push({
          platform_item_id: comment.id,
          type: 'comment',
          author_name: comment.from?.name ?? 'Facebook User',
          author_avatar_url: comment.from?.picture?.data?.url ?? null,
          author_platform_id: comment.from?.id ?? '',
          content: comment.message ?? '',
          parent_platform_post_id: postId,
          received_at: comment.created_time ?? new Date().toISOString(),
        });
      }
    } catch {
      // Skip failed requests silently
    }
  }

  return items;
}

// ──────────────────────────────────────────────────────────────────────────────
// LinkedIn — comments on UGC posts
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchLinkedInEngagement(
  platformPostIds: string[]
): Promise<IncomingEngagementItem[]> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token || platformPostIds.length === 0) return [];

  const items: IncomingEngagementItem[] = [];

  for (const shareUrn of platformPostIds) {
    try {
      const res = await fetch(
        `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(shareUrn)}/comments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );
      if (!res.ok) continue;
      const data = await res.json();

      for (const comment of data.elements ?? []) {
        const authorUrn: string = comment.actor ?? '';
        const message: string = comment.message?.text ?? '';
        items.push({
          platform_item_id: comment.$URN ?? comment.id ?? `li_${Date.now()}`,
          type: 'comment',
          author_name: authorUrn.split(':').pop() ?? 'LinkedIn Member',
          author_avatar_url: null,
          author_platform_id: authorUrn,
          content: message,
          parent_platform_post_id: shareUrn,
          received_at: comment.created?.time
            ? new Date(comment.created.time).toISOString()
            : new Date().toISOString(),
        });
      }
    } catch {
      // Skip failed requests silently
    }
  }

  return items;
}

// ──────────────────────────────────────────────────────────────────────────────
// Google Business Profile — reviews
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchGoogleBusinessEngagement(): Promise<IncomingEngagementItem[]> {
  const token = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  const locationName = process.env.GOOGLE_BUSINESS_LOCATION_NAME;
  if (!token || !locationName) return [];

  const items: IncomingEngagementItem[] = [];

  try {
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return items;
    const data = await res.json();

    for (const review of data.reviews ?? []) {
      items.push({
        platform_item_id: review.reviewId ?? `gbp_${Date.now()}`,
        type: 'review',
        author_name: review.reviewer?.displayName ?? 'Google Reviewer',
        author_avatar_url: review.reviewer?.profilePhotoUrl ?? null,
        author_platform_id: review.reviewId ?? '',
        content: review.comment ?? `${review.starRating ?? ''} star review`,
        parent_platform_post_id: null,
        received_at: review.createTime ?? new Date().toISOString(),
      });
    }
  } catch {
    // Skip failed requests silently
  }

  return items;
}
