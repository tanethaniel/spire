-- Add goal column to user_settings for pattern personalization
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS goal text;

-- Entry signals: grounded signals extracted from journal answers
CREATE TABLE entry_signals (
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

CREATE POLICY "Users own their entry_signals"
  ON entry_signals
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_entry_signals_user_entry ON entry_signals(user_id, journal_entry_id);
CREATE INDEX idx_entry_signals_user_type_value ON entry_signals(user_id, signal_type, normalized_value);

-- Daily calendar signals: minimal derived calendar metadata for pattern generation
CREATE TABLE daily_calendar_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  event_count integer,
  scheduled_minutes integer,
  meeting_minutes integer,
  focus_minutes integer,
  social_count integer,
  health_count integer,
  after_work_count integer,
  context_switch_count integer,
  day_density text CHECK (day_density IN ('light', 'balanced', 'busy', 'packed')),
  fragmentation_score numeric,
  top_event_categories text[],
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, date)
);

ALTER TABLE daily_calendar_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their daily_calendar_signals"
  ON daily_calendar_signals
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_daily_calendar_signals_user_date ON daily_calendar_signals(user_id, date);

-- Pattern insights: generated Pattern Notes
CREATE TABLE pattern_insights (
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

CREATE POLICY "Users own their pattern_insights"
  ON pattern_insights
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_pattern_insights_user_status_created ON pattern_insights(user_id, status, created_at);

-- Pattern actions: optional actions or if-then plans derived from Pattern Notes
CREATE TABLE pattern_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  pattern_insight_id uuid REFERENCES pattern_insights(id) ON DELETE CASCADE NOT NULL,
  action_type text CHECK (action_type IN ('reflection', 'experiment', 'if_then_plan')),
  text text,
  if_cue text,
  then_response text,
  status text DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'completed', 'dismissed')),
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

ALTER TABLE pattern_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their pattern_actions"
  ON pattern_actions
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_pattern_actions_user_insight ON pattern_actions(user_id, pattern_insight_id);
