-- Analytics feature set: interpretation toggle + structured signals for correlations
-- Adds a synced user-settings table (server-enforced privacy toggle) and
-- per-entry structured signals (mood + activity tags) used by cross-session tips.

-- One row per user holding the interpretation preference.
-- interpretation_enabled = true  -> Interpreted mode (themes/insight/tips, default)
-- interpretation_enabled = false -> Log mode (raw transcripts only; analysis refused server-side)
CREATE TABLE user_settings (
  user_id uuid REFERENCES auth.users(id) PRIMARY KEY,
  interpretation_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their settings"
  ON user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Structured signals for cross-session correlation tips.
-- Populated by analyze-session in Interpreted mode only; left NULL in Log mode.
--   mood_score:    -2 (very negative) .. +2 (very positive), derived from Q2 emotions
--   activity_tags: normalized lowercase tags from Q1 + calendar context (e.g. {gym,work})
ALTER TABLE journal_entries
  ADD COLUMN mood_score smallint,
  ADD COLUMN activity_tags text[];
