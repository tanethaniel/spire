ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS keyword_tags text[];
