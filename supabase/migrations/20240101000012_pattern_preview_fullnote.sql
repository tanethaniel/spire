-- Add preview_note and full_note columns for split card/detail copy
ALTER TABLE pattern_insights
  ADD COLUMN IF NOT EXISTS preview_note text,
  ADD COLUMN IF NOT EXISTS full_note text;

-- Backfill from existing note column
UPDATE pattern_insights
  SET preview_note = note, full_note = note
  WHERE preview_note IS NULL;

-- Clean up dismissed patterns older than 14 days
-- (dismissed patterns block similar candidates but expire after 2 weeks)
DELETE FROM pattern_insights
  WHERE status = 'dismissed'
  AND updated_at < now() - interval '14 days';
