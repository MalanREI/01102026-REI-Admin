// Microsoft OAuth & Graph API wrapper for the Workspace module.
// Pure HTTP library — no Supabase, no caching, no side effects.

const MS_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MS_AUTH_BASE = 'https://login.microsoftonline.com';

const SCOPES = 'openid profile email offline_access User.Read Mail.Read';

// ============================================================
// Types
// ============================================================

export interface OutlookTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string;
  token_type: string;
  scope: string;
}

export interface OutlookUserProfile {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  givenName: string | null;
  surname: string | null;
}

// ============================================================
// Internal config helper
// ============================================================

function getMicrosoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenant = process.env.MICROSOFT_TENANT || 'common';

  if (!clientId) throw new Error('Missing Microsoft OAuth config: MICROSOFT_CLIENT_ID');
  if (!clientSecret) throw new Error('Missing Microsoft OAuth config: MICROSOFT_CLIENT_SECRET');
  if (!redirectUri) throw new Error('Missing Microsoft OAuth config: MICROSOFT_REDIRECT_URI');

  return { clientId, clientSecret, redirectUri, tenant };
}

// ============================================================
// Public functions
// ============================================================

/**
 * Builds the Microsoft OAuth2 authorization URL for user consent.
 * The caller is responsible for generating and persisting the state token.
 */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri, tenant } = getMicrosoftConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state: state,
    prompt: 'select_account',
  });

  return `${MS_AUTH_BASE}/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchanges an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<OutlookTokens> {
  const { clientId, clientSecret, redirectUri, tenant } = getMicrosoftConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: SCOPES,
  });

  const res = await fetch(`${MS_AUTH_BASE}/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    token_type: data.token_type,
    scope: data.scope,
  };
}

/**
 * Refreshes an access token using a refresh token.
 * Microsoft may or may not return a new refresh_token — if absent,
 * the original is preserved in the returned object.
 */
export async function refreshAccessToken(refreshToken: string): Promise<OutlookTokens> {
  const { clientId, clientSecret, tenant } = getMicrosoftConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES,
  });

  const res = await fetch(`${MS_AUTH_BASE}/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    token_type: data.token_type,
    scope: data.scope,
  };
}

/**
 * Fetches the authenticated user's profile from Microsoft Graph.
 */
export async function fetchUserProfile(accessToken: string): Promise<OutlookUserProfile> {
  const data = await graphFetch<OutlookUserProfile>(accessToken, '/me');
  return {
    id: data.id,
    displayName: data.displayName,
    mail: data.mail ?? null,
    userPrincipalName: data.userPrincipalName,
    givenName: data.givenName ?? null,
    surname: data.surname ?? null,
  };
}

/**
 * Generic Microsoft Graph API fetch helper.
 * Throws { status, body } on non-2xx so callers can handle 401
 * (expired token) by refreshing and retrying.
 */
export async function graphFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = MS_GRAPH_BASE + path;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw { status: res.status, body };
  }

  return res.json() as Promise<T>;
}
