-- Settings table: key-value store scoped per user.
-- Used for AI configuration, preferences, and other user-specific settings.
-- Composite primary key: (user_id, key).

CREATE TABLE IF NOT EXISTS settings (
  user_id  TEXT    NOT NULL,
  key      TEXT    NOT NULL,
  value    TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
