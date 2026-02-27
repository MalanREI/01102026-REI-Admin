/**
 * /api/auth/social/[platform]
 *
 * Handles OAuth authorization and callback for social media platforms.
 *
 * GET ?action=authorize
 *   → Generates a one-time state token, stores it in social_platforms,
 *     and redirects the user to the platform's OAuth authorization URL.
 *
 * GET ?code=xxx&state=xxx  (OAuth callback from the platform)
 *   → Validates the state token, exchanges the code for an access token,
 *     updates the social_platforms record, then redirects to /social-media/settings.
 *
 * Supported platforms: facebook, instagram, linkedin, google_business
 * (instagram shares the Meta OAuth flow with facebook)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

// ─── OAuth configuration per provider ────────────────────────────────────────

type OAuthProvider = 'meta' | 'linkedin' | 'google';

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const PROVIDER_CONFIGS: Record<OAuthProvider, ProviderConfig> = {
  meta: {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: 'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish',
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: 'r_liteprofile r_emailaddress w_member_social',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/business.manage',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
};

/** Map platform names to their OAuth provider. */
function getProvider(platform: string): OAuthProvider | null {
  switch (platform) {
    case 'facebook':
    case 'instagram':
      return 'meta';
    case 'linkedin':
      return 'linkedin';
    case 'google_business':
      return 'google';
    default:
      return null;
  }
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const { searchParams } = new URL(request.url);

  const provider = getProvider(platform);
  if (!provider) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const config = PROVIDER_CONFIGS[provider];
  const action = searchParams.get('action');

  // ── Initiate OAuth ─────────────────────────────────────────────────────────
  if (action === 'authorize') {
    const clientId = process.env[config.clientIdEnv];
    if (!clientId) {
      return NextResponse.json(
        { error: `${config.clientIdEnv} is not configured` },
        { status: 500 }
      );
    }

    // Generate a random state token
    const state = crypto.randomUUID();
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const redirectUri = `${siteUrl}/api/auth/social/${platform}`;

    // Store the state in the social_platforms record (upsert by platform_name)
    const supabase = await createClient();
    const { error: stateError } = await supabase
      .from('social_platforms')
      .update({ oauth_state: state })
      .eq('platform_name', platform);

    if (stateError) {
      return NextResponse.json({ error: 'Failed to store OAuth state' }, { status: 500 });
    }

    // Build the authorization URL
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: config.scopes,
      state,
      response_type: 'code',
    });

    // Google requires access_type=offline for refresh tokens
    if (provider === 'google') {
      authParams.set('access_type', 'offline');
      authParams.set('prompt', 'consent');
    }

    return NextResponse.redirect(`${config.authUrl}?${authParams.toString()}`);
  }

  // ── OAuth callback (code + state) ─────────────────────────────────────────
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const settingsUrl = '/social-media/settings';

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=${encodeURIComponent(oauthError)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=missing_code_or_state`, request.url)
    );
  }

  const supabase = await createClient();

  // Validate state token
  const { data: platformRecord, error: lookupError } = await supabase
    .from('social_platforms')
    .select('id, platform_name')
    .eq('platform_name', platform)
    .eq('oauth_state', state)
    .single();

  if (lookupError || !platformRecord) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=invalid_state`, request.url)
    );
  }

  // Exchange code for access token
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
  const redirectUri = `${siteUrl}/api/auth/social/${platform}`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=missing_credentials`, request.url)
    );
  }

  try {
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? 'Token exchange failed');
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string | null = tokenData.refresh_token ?? null;
    const expiresIn: number | null = tokenData.expires_in ?? null;
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // For Meta platforms, exchange for a long-lived token
    let finalToken = accessToken;
    if (provider === 'meta' && expiresIn && expiresIn < 7200) {
      const longLivedRes = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token` +
          `?grant_type=fb_exchange_token` +
          `&client_id=${clientId}` +
          `&client_secret=${clientSecret}` +
          `&fb_exchange_token=${accessToken}`
      );
      const longLivedData = await longLivedRes.json();
      if (longLivedRes.ok && longLivedData.access_token) {
        finalToken = longLivedData.access_token;
      }
    }

    // Fetch account info to store the account name/ID
    let accountName = platform;
    let accountId = '';

    if (provider === 'meta') {
      const meRes = await fetch(
        `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${finalToken}`
      );
      if (meRes.ok) {
        const meData = await meRes.json();
        accountName = meData.name ?? platform;
        accountId = meData.id ?? '';
      }
    } else if (provider === 'linkedin') {
      const meRes = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${finalToken}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        accountName = `${meData.localizedFirstName ?? ''} ${meData.localizedLastName ?? ''}`.trim() || platform;
        accountId = meData.id ?? '';
      }
    }

    // Update the social_platforms record
    await supabase
      .from('social_platforms')
      .update({
        access_token: finalToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        account_name: accountName,
        account_id: accountId,
        is_connected: true,
        oauth_state: null, // clear the state
        updated_at: new Date().toISOString(),
      })
      .eq('id', platformRecord.id);

    return NextResponse.redirect(
      new URL(`${settingsUrl}?connected=${platform}`, request.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
