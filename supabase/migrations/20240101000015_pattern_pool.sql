-- Phase 1: Extend entry_signals for richer signal kinds
ALTER TABLE entry_signals
  ADD COLUMN IF NOT EXISTS signal_kind text DEFAULT 'flat'
    CHECK (signal_kind IN ('flat', 'behavioral_link', 'emotional_theme')),
  ADD COLUMN IF NOT EXISTS trigger_context text,
  ADD COLUMN IF NOT EXISTS response text,
  ADD COLUMN IF NOT EXISTS emotional_outcome text,
  ADD COLUMN IF NOT EXISTS outcome_valence integer
    CHECK (outcome_valence BETWEEN -2 AND 2),
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS intensity text
    CHECK (intensity IN ('low', 'moderate', 'strong'));

CREATE INDEX IF NOT EXISTS idx_entry_signals_kind
  ON entry_signals(user_id, signal_kind);

-- Phase 1: Pattern pool — living pattern entities with slot state machine
CREATE TABLE IF NOT EXISTS pattern_pool (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,

  pattern_kind text NOT NULL
    CHECK (pattern_kind IN ('behavioral_link', 'emotional_theme')),
  signature text NOT NULL,

  title text,
  preview_note text,
  full_note text,
  goal_connection text,
  personality_framing text,
  reflection_prompt text,
  suggested_experiment text,

  evidence_count integer DEFAULT 0,
  session_count integer DEFAULT 0,
  confidence text DEFAULT 'early_signal'
    CHECK (confidence IN ('early_signal', 'emerging_pattern', 'strong_pattern')),
  first_evidence_at timestamptz,
  last_evidence_at timestamptz,
  supporting_entry_ids uuid[] DEFAULT '{}',
  mood_delta numeric,
  related_tags text[] DEFAULT '{}',

  slot_state text DEFAULT 'pool'
    CHECK (slot_state IN ('pool', 'active', 'dimmed', 'saved', 'dismissed')),
  slot_promoted_at timestamptz,
  decay_started_at timestamptz,
  has_new_evidence boolean DEFAULT false,

  user_feedback text
    CHECK (user_feedback IN ('true', 'kind_of', 'not_really')),
  last_interacted_at timestamptz,

  model_version text,
  prompt_version text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  UNIQUE(user_id, signature)
);

CREATE INDEX IF NOT EXISTS idx_pattern_pool_user_state
  ON pattern_pool(user_id, slot_state);
CREATE INDEX IF NOT EXISTS idx_pattern_pool_user_evidence
  ON pattern_pool(user_id, last_evidence_at);

-- Pattern evidence: links individual signals to pool patterns
CREATE TABLE IF NOT EXISTS pattern_evidence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_pool_id uuid REFERENCES pattern_pool(id) ON DELETE CASCADE NOT NULL,
  entry_signal_id uuid REFERENCES entry_signals(id) ON DELETE CASCADE NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
  added_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(pattern_pool_id, entry_signal_id)
);

CREATE INDEX IF NOT EXISTS idx_pattern_evidence_pool
  ON pattern_evidence(pattern_pool_id);
CREATE INDEX IF NOT EXISTS idx_pattern_evidence_entry
  ON pattern_evidence(journal_entry_id);

-- RLS
ALTER TABLE pattern_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY pattern_pool_owner ON pattern_pool
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY pattern_evidence_owner ON pattern_evidence
  FOR ALL USING (
    pattern_pool_id IN (SELECT id FROM pattern_pool WHERE user_id = auth.uid())
  );
