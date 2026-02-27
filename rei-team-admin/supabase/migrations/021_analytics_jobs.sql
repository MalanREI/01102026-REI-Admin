-- 021_analytics_jobs.sql
-- Track when analytics were last fetched per published post so the cron
-- job can efficiently skip posts that were recently synced.

ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS last_analytics_fetched_at timestamptz;

-- Index to let the analytics cron quickly find posts that need syncing:
-- published posts whose analytics have never been fetched or were fetched
-- more than 24 hours ago.
CREATE INDEX IF NOT EXISTS idx_content_posts_analytics_sync
  ON content_posts (last_analytics_fetched_at)
  WHERE status = 'published';
