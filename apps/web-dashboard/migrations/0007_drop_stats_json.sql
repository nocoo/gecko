-- Migration 0007: Drop stats_json column from daily_summaries
-- Run with: npx wrangler d1 execute gecko --remote --file=drizzle/0007_drop_stats_json.sql
--
-- Stats are always computed fresh from focus_sessions using timezone-aware
-- day boundaries. The stats_json cache column is no longer read or written.
-- Only AI analysis results are cached in this table.
--
-- SQLite does not support ALTER TABLE DROP COLUMN, so we rebuild the table.

-- 1. Create new table without stats_json
CREATE TABLE daily_summaries_new (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  date            TEXT NOT NULL,
  ai_score        INTEGER,
  ai_result_json  TEXT,
  ai_model        TEXT,
  ai_generated_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Copy data (drop stats_json)
INSERT INTO daily_summaries_new
    SELECT id, user_id, date, ai_score, ai_result_json,
           ai_model, ai_generated_at, created_at, updated_at
    FROM daily_summaries;

-- 3. Drop old table
DROP TABLE daily_summaries;

-- 4. Rename
ALTER TABLE daily_summaries_new RENAME TO daily_summaries;

-- 5. Recreate index
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summaries_user_date
  ON daily_summaries(user_id, date);
