-- Gecko D1 Cloud Database: v2_slim_columns
-- Run with: npx wrangler d1 execute gecko --remote --file=drizzle/0002_slim_columns.sql
--
-- Changes:
--   focus_sessions.end_time: NOT NULL → nullable (no longer INSERTed; redundant with start_time + duration)
--   focus_sessions.synced_at: NOT NULL → DEFAULT (datetime('now')) (auto-populated by D1)
--   sync_logs.synced_at: NOT NULL → DEFAULT (datetime('now'))
--
-- SQLite does not support ALTER COLUMN, so we must rebuild the tables.

-- =========================================================================
-- 1. Rebuild focus_sessions
-- =========================================================================

CREATE TABLE focus_sessions_new (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    app_name        TEXT    NOT NULL,
    window_title    TEXT    NOT NULL,
    url             TEXT,
    start_time      REAL    NOT NULL,
    end_time        REAL,
    duration        REAL    NOT NULL DEFAULT 0,
    bundle_id       TEXT,
    tab_title       TEXT,
    tab_count       INTEGER,
    document_path   TEXT,
    is_full_screen  INTEGER DEFAULT 0,
    is_minimized    INTEGER DEFAULT 0,
    synced_at       TEXT    DEFAULT (datetime('now'))
);

INSERT INTO focus_sessions_new
    SELECT id, user_id, device_id, app_name, window_title, url,
           start_time, end_time, duration, bundle_id, tab_title,
           tab_count, document_path, is_full_screen, is_minimized, synced_at
    FROM focus_sessions;

DROP TABLE focus_sessions;

ALTER TABLE focus_sessions_new RENAME TO focus_sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_user_time  ON focus_sessions(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_user_app   ON focus_sessions(user_id, app_name);
CREATE INDEX IF NOT EXISTS idx_sessions_device     ON focus_sessions(device_id);

-- =========================================================================
-- 2. Rebuild sync_logs
-- =========================================================================

CREATE TABLE sync_logs_new (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    session_count   INTEGER NOT NULL,
    first_start     REAL    NOT NULL,
    last_start      REAL    NOT NULL,
    synced_at       TEXT    DEFAULT (datetime('now'))
);

INSERT INTO sync_logs_new
    SELECT id, user_id, device_id, session_count, first_start, last_start, synced_at
    FROM sync_logs;

DROP TABLE sync_logs;

ALTER TABLE sync_logs_new RENAME TO sync_logs;

CREATE INDEX IF NOT EXISTS idx_sync_user ON sync_logs(user_id, synced_at);
