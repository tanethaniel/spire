-- Persist which onboarding guide chips a user has seen, so they only appear
-- on first experience. localStorage alone is unreliable on iOS PWAs (evicted
-- on cache clear), causing the chips to reappear.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS tooltips_seen jsonb NOT NULL DEFAULT '[]'::jsonb;
