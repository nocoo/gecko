-- Migration 0006: Add app notes.
--
-- Allows users to attach a short note to each tracked app (bundle_id).
-- Notes provide context for AI analysis (e.g. "This is my work IDE",
-- "Used for personal social media browsing").
-- 1 user : 1 note per bundle_id.

CREATE TABLE IF NOT EXISTS app_notes (
  user_id    TEXT NOT NULL,
  bundle_id  TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id)
);
