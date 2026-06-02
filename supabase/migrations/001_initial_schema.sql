-- Journal entries: one row per completed session
CREATE TABLE journal_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  q1_transcript text,
  q2_transcript text,
  q3_transcript text,
  q4_transcript text,
  q5_transcript text,
  q6_transcript text,
  themes text[],
  insight text,
  event_context jsonb,
  duration_ms integer,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their entries"
  ON journal_entries
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX idx_journal_entries_created_at ON journal_entries(created_at);

-- User events: analytics + per-question completion tracking
CREATE TABLE user_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  event text NOT NULL,
  question_index integer,
  source text,
  duration_ms integer,
  metadata jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their events"
  ON user_events
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_events_user_id ON user_events(user_id);
CREATE INDEX idx_user_events_event ON user_events(event);
CREATE INDEX idx_user_events_created_at ON user_events(created_at);
