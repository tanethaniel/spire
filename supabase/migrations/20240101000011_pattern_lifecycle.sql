-- Add last_interacted_at for tracking user engagement (feedback, save, open).
-- Distinct from updated_at which changes on server-side evidence refresh.
-- Used by the 2-week auto-archive rule.
ALTER TABLE pattern_insights
  ADD COLUMN IF NOT EXISTS last_interacted_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE pattern_insights SET last_interacted_at = COALESCE(updated_at, created_at)
  WHERE last_interacted_at IS NULL;
