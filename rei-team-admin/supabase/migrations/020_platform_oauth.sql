-- 020_platform_oauth.sql
-- Add OAuth state tracking to social_platforms for secure OAuth token exchange.
-- The oauth_state column stores a one-time random token generated when the user
-- begins the OAuth flow; it is cleared (set to NULL) once the callback completes.

ALTER TABLE social_platforms
  ADD COLUMN IF NOT EXISTS oauth_state text;

-- Fast lookup during OAuth callback validation
CREATE INDEX IF NOT EXISTS idx_social_platforms_oauth_state
  ON social_platforms (oauth_state)
  WHERE oauth_state IS NOT NULL;
