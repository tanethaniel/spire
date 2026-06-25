-- Persist Google refresh token so calendar works across mobile app restarts.
-- sessionStorage is tab-scoped and cleared when the PWA is relaunched on mobile.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_refresh_token text;
