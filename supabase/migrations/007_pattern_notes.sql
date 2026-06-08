-- Add goal column to user_settings for pattern personalization
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS goal text;

-- Entry signals: grounded signals extracted from journal answers
CREATE TABLE IF NOT EXISTS entry_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
  question_index integer,
  source_transcript text,
  quote text,
  signal_type text NOT NULL CHECK (signal_type IN ('activity', 'emotion', 'energy', 'stress', 'relationship', 'work', 'health', 'recovery', 'self_belief', 'need', 'value', 'avoidance', 'gratitude', 'learning', 'memory', 'social_context')),
  signal_value text NOT NULL,
  normalized_value text,
  sentiment integer CHECK (sentiment BETWEEN -2 AND 2),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE entry_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users own their entry_signals"
    ON entry_signals FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_entry_signals_user_entry ON entry_signals(user_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_signals_user_type_value ON entry_signals(user_id, signal_type, normalized_value);

-- Pattern insights: generated Pattern Notes
CREATE TABLE IF NOT EXISTS pattern_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  pattern_type text NOT NULL,
  title text NOT NULL,
  note text NOT NULL,
  goal_connection text,
  personality_framing text,
  evidence_summary text,
  confidence text NOT NULL CHECK (confidence IN ('early_signal', 'emerging_pattern', 'strong_pattern')),
  confidence_reason text,
  evidence_count integer,
  entry_count integer,
  date_range_start date,
  date_range_end date,
  supporting_entry_ids uuid[],
  supporting_quotes jsonb,
  related_calendar_context jsonb,
  related_tags text[],
  mood_delta numeric,
  reflection_prompt text,
  suggested_experiment text,
  suggested_if_then_plan jsonb,
  status text DEFAULT 'active' CHECK (status IN ('active', 'saved', 'dismissed', 'watching', 'archived')),
  user_feedback text CHECK (user_feedback IN ('true', 'kind_of', 'not_really')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE pattern_insights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users own their pattern_insights"
    ON pattern_insights FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_pattern_insights_user_status_created ON pattern_insights(user_id, status, created_at);
