-- Track AI model and prompt versions for auditability
ALTER TABLE pattern_insights ADD COLUMN IF NOT EXISTS model_version text;
ALTER TABLE pattern_insights ADD COLUMN IF NOT EXISTS prompt_version text;
