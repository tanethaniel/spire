-- Add support for branching session format alongside the existing structured flow
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS freeform_transcript text,
  ADD COLUMN IF NOT EXISTS followup_transcripts jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS session_format text DEFAULT 'structured'
    CHECK (session_format IN ('structured', 'branching'));
