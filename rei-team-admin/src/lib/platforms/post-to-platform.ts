/**
 * post-to-platform.ts
 * Platform posting layer for the REI Social Media Command Center.
 *
 * Each `postToPlatform` call attempts to publish a content post to the
 * specified platform.  Real API credentials are read from environment
 * variables at call time; if a key is absent the call falls back to a mock
 * response so that the cron engine can be exercised in development.
 *
 * Adding a real integration:
 *   1. Set the platform's env vars (see comments per platform below).
 *   2. Replace the `// TODO: real API call` block with the actual SDK call.
 *   3. Return the platform-assigned post ID in `platformPostId`.
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

// ──────────────────────────────────────────────────────────────────────────────
// Per-platform posting logic
// ──────────────────────────────────────────────────────────────────────────────

async function postToInstagram(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  // Env: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;

  if (!token || !accountId) {
    // Mock: simulate a successful post for development / staging
    return mockSuccess('instagram', payload.postId);
  }

  try {
    // TODO: real API call using Instagram Graph API
    // const res = await fetch(`https://graph.instagram.com/v18.0/${accountId}/media`, { ... });
    return mockSuccess('instagram', payload.postId);
  } catch (err) {
    return { platform: 'instagram', success: false, platformPostId: null, error: String(err) };
  }
}

async function postToFacebook(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  // Env: FACEBOOK_ACCESS_TOKEN, FACEBOOK_PAGE_ID
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) {
    return mockSuccess('facebook', payload.postId);
  }

  try {
    // TODO: real API call using Facebook Graph API
    // const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, { ... });
    return mockSuccess('facebook', payload.postId);
  } catch (err) {
    return { platform: 'facebook', success: false, platformPostId: null, error: String(err) };
  }
}

async function postToLinkedIn(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  // Env: LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN (urn:li:person:... or urn:li:organization:...)
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN;

  if (!token || !authorUrn) {
    return mockSuccess('linkedin', payload.postId);
  }

  try {
    // TODO: real API call using LinkedIn UGC Post API
    // const res = await fetch('https://api.linkedin.com/v2/ugcPosts', { ... });
    return mockSuccess('linkedin', payload.postId);
  } catch (err) {
    return { platform: 'linkedin', success: false, platformPostId: null, error: String(err) };
  }
}

async function postToTikTok(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  // Env: TIKTOK_ACCESS_TOKEN
  const token = process.env.TIKTOK_ACCESS_TOKEN;

  if (!token) {
    return mockSuccess('tiktok', payload.postId);
  }

  try {
    // TODO: real API call using TikTok Content Posting API
    // const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', { ... });
    return mockSuccess('tiktok', payload.postId);
  } catch (err) {
    return { platform: 'tiktok', success: false, platformPostId: null, error: String(err) };
  }
}

async function postToYouTube(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  // Env: YOUTUBE_ACCESS_TOKEN, YOUTUBE_CHANNEL_ID
  const token = process.env.YOUTUBE_ACCESS_TOKEN;

  if (!token) {
    return mockSuccess('youtube', payload.postId);
  }

  try {
    // TODO: real API call using YouTube Data API v3
    // const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos', { ... });
    return mockSuccess('youtube', payload.postId);
  } catch (err) {
    return { platform: 'youtube', success: false, platformPostId: null, error: String(err) };
  }
}

async function postToGoogleBusiness(payload: PlatformPostPayload): Promise<PlatformPostResult> {
  // Env: GOOGLE_BUSINESS_ACCESS_TOKEN, GOOGLE_BUSINESS_ACCOUNT_ID, GOOGLE_BUSINESS_LOCATION_ID
  const token = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;

  if (!token || !accountId || !locationId) {
    return mockSuccess('google_business', payload.postId);
  }

  try {
    // TODO: real API call using Google My Business API
    // const res = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`, { ... });
    return mockSuccess('google_business', payload.postId);
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
 * Returns a `PlatformPostResult` describing success or failure.
 * Never throws — callers should check `result.success`.
 */
export async function postToPlatform(
  platform: string,
  payload: PlatformPostPayload
): Promise<PlatformPostResult> {
  try {
    switch (platform as PlatformName) {
      case 'instagram':     return postToInstagram(payload);
      case 'facebook':      return postToFacebook(payload);
      case 'linkedin':      return postToLinkedIn(payload);
      case 'tiktok':        return postToTikTok(payload);
      case 'youtube':       return postToYouTube(payload);
      case 'google_business': return postToGoogleBusiness(payload);
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
