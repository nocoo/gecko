-- Gecko D1 Cloud Database: v1_cloud_init
-- Run with: npx wrangler d1 execute gecko --remote --file=drizzle/0001_cloud_init.sql

-- Focus sessions (mirrors local schema + user_id, device_id, synced_at)
CREATE TABLE IF NOT EXISTS focus_sessions (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    app_name        TEXT    NOT NULL,
    window_title    TEXT    NOT NULL,
    url             TEXT,
    start_time      REAL    NOT NULL,
    end_time        REAL    NOT NULL,
    duration        REAL    NOT NULL DEFAULT 0,
    bundle_id       TEXT,
    tab_title       TEXT,
    tab_count       INTEGER,
    document_path   TEXT,
    is_full_screen  INTEGER DEFAULT 0,
    is_minimized    INTEGER DEFAULT 0,
    synced_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_time  ON focus_sessions(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_user_app   ON focus_sessions(user_id, app_name);
CREATE INDEX IF NOT EXISTS idx_sessions_device     ON focus_sessions(device_id);

-- API keys (macOS app authentication, one key per device)
CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    key_hash    TEXT    NOT NULL UNIQUE,
    device_id   TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL,
    last_used   TEXT
);

CREATE INDEX IF NOT EXISTS idx_keys_user ON api_keys(user_id);

-- Sync logs (audit trail for batch uploads)
CREATE TABLE IF NOT EXISTS sync_logs (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    session_count   INTEGER NOT NULL,
    first_start     REAL    NOT NULL,
    last_start      REAL    NOT NULL,
    synced_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_user ON sync_logs(user_id, synced_at);
