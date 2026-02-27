/**
 * post-to-platform.ts
 * Platform posting layer for the REI Social Media Command Center.
 *
 * Each `postToPlatform` call attempts to publish a content post to the
 * specified platform using real API calls.  Credentials are sourced from the
 * `social_platforms` DB table (set via Settings → Platform Connections OAuth)
 * and passed in via the optional `credentials` parameter.  If credentials are
 * absent the call falls back to env vars for local dev, then to a mock
 * response so the cron engine works without any platform connection.
 */

import type { PlatformName } from '@/src/lib/types/social-media';

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

export interface PlatformPostPayload {
  postId: string;
  body: string;
  title: string | null;
  mediaUrls: string[] | null;
  platformSpecificContent: Record<string, string> | null;
}

export interface PlatformPostResult {
  platform: PlatformName;
  success: boolean;
  /** Platform-assigned ID for the published post (populated on success). */
  platformPostId: string | null;
  /** Human-readable error message (populated on failure). */
  error: string | null;
}

/**
 * Credentials sourced from the `social_platforms` DB row for a connected
 * platform.  Passed by the cron route so posting uses the OAuth token the
 * user connected via Settings → Platform Connections.
 */
export interface PlatformCredentials {
  accessToken: string;
  /** Page ID (FB), IG account ID, or Google Business location name. */
  accountId: string;
  /** LinkedIn only — urn:li:organization:XXXXX */
  authorUrn?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Instagram — Meta Graph API
// ──────────────────────────────────────────────────────────────────────────────

async function postToInstagram(payload: PlatformPostPayload, credentials?: PlatformCredentials): Promise<PlatformPostResult> {
  const token = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = credentials?.accountId ?? process.env.INSTAGRAM_ACCOUNT_ID;

  if (!token || !accountId) {
    return mockSuccess('instagram', payload.postId);
  }

  const BASE = `https://graph.instagram.com/v18.0`;
  const hasMedia = payload.mediaUrls && payload.mediaUrls.length > 0;

  try {
    if (!hasMedia) {
      return {
        platform: 'instagram',
        success: false,
        platformPostId: null,
        error: 'Instagram requires at least one image or video',
      };
    }

    let containerId: string;

    if (payload.mediaUrls!.length === 1) {
      // Single image container
      const res = await fetch(
        `${BASE}/${accountId}/media` +
          `?image_url=${encodeURIComponent(payload.mediaUrls![0])}` +
          `&caption=${encodeURIComponent(payload.body)}` +
          `&access_token=${token}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed to create media container');
      containerId = data.id;
    } else {
      // Carousel: create each child then the parent container
      const childIds: string[] = [];
      for (const url of payload.mediaUrls!) {
        const childRes = await fetch(
          `${BASE}/${accountId}/media` +
            `?image_url=${encodeURIComponent(url)}` +
            `&is_carousel_item=true` +
            `&access_token=${token}`,
          { method: 'POST' }
        );
        const childData = await childRes.json();
        if (!childRes.ok) throw new Error(childData.error?.message ?? 'Failed to create carousel item');
        childIds.push(childData.id);
      }
      const containerRes = await fetch(
        `${BASE}/${accountId}/media` +
          `?media_type=CAROUSEL` +
          `&children=${childIds.join(',')}` +
          `&caption=${encodeURIComponent(payload.body)}` +
          `&access_token=${token}`,
        { method: 'POST' }
      );
      const containerData = await containerRes.json();
      if (!containerRes.ok) throw new Error(containerData.error?.message ?? 'Failed to create carousel container');
      containerId = containerData.id;
    }

    // Publish the container
    const publishRes = await fetch(
      `${BASE}/${accountId}/media_publish` +
        `?creation_id=${containerId}` +
        `&access_token=${token}`,
      { method: 'POST' }
    );
    const publishData = await publishRes.json();
    if (!publishRes.ok) throw new Error(publishData.error?.message ?? 'Failed to publish media');

    return { platform: 'instagram', success: true, platformPostId: publishData.id, error: null };
  } catch (err) {
    return { platform: 'instagram', success: false, platformPostId: null, error: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Facebook — Meta Graph API
// ──────────────────────────────────────────────────────────────────────────────

async function postToFacebook(payload: PlatformPostPayload, credentials?: PlatformCredentials): Promise<PlatformPostResult> {
  const token = credentials?.accessToken ?? process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = credentials?.accountId ?? process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) {
    return mockSuccess('facebook', payload.postId);
  }

  const BASE = `https://graph.facebook.com/v18.0`;
  const hasMedia = payload.mediaUrls && payload.mediaUrls.length > 0;

  try {
    let postId: string;

    if (hasMedia) {
      // Photo post
      const body = new URLSearchParams({
        url: payload.mediaUrls![0],
        caption: payload.body,
        access_token: token,
      });
      const res = await fetch(`${BASE}/${pageId}/photos`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed to post photo');
      postId = data.post_id ?? data.id;
    } else {
      // Text / link post
      const body = new URLSearchParams({ message: payload.body, access_token: token });
      const res = await fetch(`${BASE}/${pageId}/feed`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed to post to feed');
      postId = data.id;
    }

    return { platform: 'facebook', success: true, platformPostId: postId, error: null };
  } catch (err) {
    return { platform: 'facebook', success: false, platformPostId: null, error: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// LinkedIn — UGC Posts API
// ──────────────────────────────────────────────────────────────────────────────

async function postToLinkedIn(payload: PlatformPostPayload, credentials?: PlatformCredentials): Promise<PlatformPostResult> {
  const token = credentials?.accessToken ?? process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = credentials?.authorUrn ?? credentials?.accountId ?? process.env.LINKEDIN_AUTHOR_URN;

  if (!token || !authorUrn) {
    return mockSuccess('linkedin', payload.postId);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };

  try {
    let mediaCategory = 'NONE';
    let media: unknown[] = [];

    const hasMedia = payload.mediaUrls && payload.mediaUrls.length > 0;

    if (hasMedia) {
      // 1. Register upload
      const registerRes = await fetch(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: authorUrn,
              serviceRelationships: [
                { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
              ],
            },
          }),
        }
      );
      const registerData = await registerRes.json();
      if (!registerRes.ok) throw new Error(registerData.message ?? 'Failed to register LinkedIn upload');

      const uploadUrl =
        registerData.value?.uploadMechanism?.[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ]?.uploadUrl;
      const assetUrn = registerData.value?.asset;

      if (uploadUrl && assetUrn) {
        // 2. Upload the image binary
        const imageRes = await fetch(payload.mediaUrls![0]);
        const imageBuffer = await imageRes.arrayBuffer();
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: imageBuffer,
        });

        mediaCategory = 'IMAGE';
        media = [
          {
            status: 'READY',
            description: { text: payload.title ?? '' },
            media: assetUrn,
            title: { text: payload.title ?? '' },
          },
        ];
      }
    }

    // 3. Create the UGC post
    const ugcRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: payload.body },
            shareMediaCategory: mediaCategory,
            ...(media.length > 0 ? { media } : {}),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    });
    const ugcData = await ugcRes.json();
    if (!ugcRes.ok) throw new Error(ugcData.message ?? 'Failed to create LinkedIn post');

    return { platform: 'linkedin', success: true, platformPostId: ugcData.id, error: null };
  } catch (err) {
    return { platform: 'linkedin', success: false, platformPostId: null, error: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TikTok — Content Posting API (mocked; no API credentials expected)
// ──────────────────────────────────────────────────────────────────────────────

async function postToTikTok(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) return mockSuccess('tiktok', payload.postId);

  try {
    // TikTok Content Posting API requires a video upload URL workflow.
    // Implement when TikTok integration is enabled.
    return mockSuccess('tiktok', payload.postId);
  } catch (err) {
    return { platform: 'tiktok', success: false, platformPostId: null, error: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// YouTube — Data API v3 (mocked; no API credentials expected)
// ──────────────────────────────────────────────────────────────────────────────

async function postToYouTube(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  const token = process.env.YOUTUBE_ACCESS_TOKEN;
  if (!token) return mockSuccess('youtube', payload.postId);

  try {
    // YouTube upload requires a resumable upload workflow via the Data API v3.
    // Implement when YouTube integration is enabled.
    return mockSuccess('youtube', payload.postId);
  } catch (err) {
    return { platform: 'youtube', success: false, platformPostId: null, error: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Google Business Profile — My Business API v4
// ──────────────────────────────────────────────────────────────────────────────

async function postToGoogleBusiness(payload: PlatformPostPayload, credentials?: PlatformCredentials): Promise<PlatformPostResult> {
  const token = credentials?.accessToken ?? process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  // Full resource name, e.g. "accounts/123456789/locations/987654321"
  const locationName = credentials?.accountId ?? process.env.GOOGLE_BUSINESS_LOCATION_NAME;

  if (!token || !locationName) {
    return mockSuccess('google_business', payload.postId);
  }

  try {
    const hasMedia = payload.mediaUrls && payload.mediaUrls.length > 0;

    const requestBody: Record<string, unknown> = {
      languageCode: 'en',
      summary: payload.body,
      topicType: 'STANDARD',
    };

    if (hasMedia) {
      requestBody.media = [{ mediaFormat: 'PHOTO', sourceUrl: payload.mediaUrls![0] }];
    }

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'Failed to create Google Business post');

    return { platform: 'google_business', success: true, platformPostId: data.name, error: null };
  } catch (err) {
    return { platform: 'google_business', success: false, platformPostId: null, error: String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Post content to a single platform.
 *
 * Pass `credentials` (from the `social_platforms` DB row) so the function
 * uses the OAuth token the user connected via Settings → Platform Connections.
 * Falls back to env vars when credentials are omitted (dev / testing).
 *
 * Never throws — callers should check `result.success`.
 */
export async function postToPlatform(
  platform: string,
  payload: PlatformPostPayload,
  credentials?: PlatformCredentials
): Promise<PlatformPostResult> {
  try {
    switch (platform as PlatformName) {
      case 'instagram':       return postToInstagram(payload, credentials);
      case 'facebook':        return postToFacebook(payload, credentials);
      case 'linkedin':        return postToLinkedIn(payload, credentials);
      case 'tiktok':          return postToTikTok(payload);
      case 'youtube':         return postToYouTube(payload);
      case 'google_business': return postToGoogleBusiness(payload, credentials);
      default:
        return {
          platform: platform as PlatformName,
          success: false,
          platformPostId: null,
          error: `Unknown platform: ${platform}`,
        };
    }
  } catch (err) {
    return {
      platform: platform as PlatformName,
      success: false,
      platformPostId: null,
      error: String(err),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Returns a simulated success result used in development when API keys are absent. */
function mockSuccess(platform: PlatformName, postId: string): PlatformPostResult {
  return {
    platform,
    success: true,
    platformPostId: `mock_${platform}_${postId}_${Date.now()}`,
    error: null,
  };
}
