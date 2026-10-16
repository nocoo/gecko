-- Migration 0009: independent analysis claim lease columns.
-- Normalize leftover __analyzing__ placeholders that have no result.

ALTER TABLE daily_summaries ADD COLUMN claim_token TEXT;
ALTER TABLE daily_summaries ADD COLUMN claim_expires_at INTEGER;

UPDATE daily_summaries
SET ai_model = NULL,
    claim_token = NULL,
    claim_expires_at = NULL
WHERE ai_model = '__analyzing__'
  AND ai_result_json IS NULL;
