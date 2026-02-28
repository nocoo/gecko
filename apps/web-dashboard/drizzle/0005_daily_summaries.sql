-- Migration 0005: Daily summaries table
-- Caches rule-based stats and AI analysis results per user per date.

CREATE TABLE IF NOT EXISTS daily_summaries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  date            TEXT NOT NULL,
  stats_json      TEXT NOT NULL,
  ai_score        INTEGER,
  ai_result_json  TEXT,
  ai_model        TEXT,
  ai_generated_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summaries_user_date
  ON daily_summaries(user_id, date);
