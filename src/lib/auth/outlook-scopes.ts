// Centralized Outlook OAuth scope definitions.
// SERVER + CLIENT safe — no env reads, no fetch, just constants.

export const OUTLOOK_REQUIRED_SCOPES = [
  // OIDC scopes (always needed for /me to return profile info)
  'openid',
  'profile',
  'email',
  // Refresh token capability
  'offline_access',
  // Read user profile (display name, email, etc.)
  'User.Read',
  // Read AND write mail (superset of Mail.Read)
  'Mail.ReadWrite',
  // Send mail as user (compose / reply / forward)
  'Mail.Send',
  // Full calendar CRUD
  'Calendars.ReadWrite',
] as const;

export const OUTLOOK_SCOPES_STRING = OUTLOOK_REQUIRED_SCOPES.join(' ');

/**
 * Check whether a connected account has all required scopes.
 * Microsoft sometimes returns scopes case-differently, so compare lowercase.
 */
export function hasAllRequiredScopes(grantedScopes: string[] | null | undefined): boolean {
  if (!grantedScopes || grantedScopes.length === 0) return false;
  const granted = new Set(grantedScopes.map(s => s.toLowerCase()));
  return OUTLOOK_REQUIRED_SCOPES.every(required => granted.has(required.toLowerCase()));
}

/**
 * Returns the specific scopes missing from the granted set.
 */
export function getMissingScopes(grantedScopes: string[] | null | undefined): string[] {
  if (!grantedScopes) return [...OUTLOOK_REQUIRED_SCOPES];
  const granted = new Set(grantedScopes.map(s => s.toLowerCase()));
  return OUTLOOK_REQUIRED_SCOPES.filter(required => !granted.has(required.toLowerCase()));
}
