-- Session-level dedup: each journal entry belongs to exactly one session.
-- Prevents duplicate entries from effect re-fires or StrictMode double-mounts.
ALTER TABLE journal_entries
  ADD COLUMN session_id uuid;

-- Unique per user: a user can only have one entry per session.
CREATE UNIQUE INDEX idx_journal_entries_session_dedup
  ON journal_entries (user_id, session_id)
  WHERE session_id IS NOT NULL;
