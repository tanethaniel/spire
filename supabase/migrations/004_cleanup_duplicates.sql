-- Remove duplicate journal entries: keep the newest per (user, day, transcripts).
-- Also strip meta-themes from existing entries that reference the session itself.

DELETE FROM journal_entries
WHERE id NOT IN (
  SELECT DISTINCT ON (
    user_id,
    DATE(created_at),
    COALESCE(q1_transcript, ''),
    COALESCE(q2_transcript, ''),
    COALESCE(q3_transcript, ''),
    COALESCE(q4_transcript, ''),
    COALESCE(q5_transcript, ''),
    COALESCE(q6_transcript, '')
  ) id
  FROM journal_entries
  ORDER BY
    user_id,
    DATE(created_at),
    COALESCE(q1_transcript, ''),
    COALESCE(q2_transcript, ''),
    COALESCE(q3_transcript, ''),
    COALESCE(q4_transcript, ''),
    COALESCE(q5_transcript, ''),
    COALESCE(q6_transcript, ''),
    created_at DESC
);

-- Strip meta-themes that describe the session rather than the user's reflection.
UPDATE journal_entries
SET themes = (
  SELECT COALESCE(array_agg(t), '{}')
  FROM unnest(themes) AS t
  WHERE t !~* '\m(transcript|session|entry|data|record|absent|empty)\M'
)
WHERE themes IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(themes) AS t
    WHERE t ~* '\m(transcript|session|entry|data|record|absent|empty)\M'
  );
