/**
 * Initialize a local SQLite database with the full gecko schema.
 *
 * Applies all drizzle migrations (0001–0008) as a single DDL pass,
 * producing the final schema suitable for E2E and BDD testing.
 *
 * Usage:
 *   bun run scripts/init-local-db.ts [path]
 *
 * If path is omitted, defaults to .local/gecko-test.db (relative to cwd).
 * The file is deleted and recreated on each run for a clean slate.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.argv[2] || ".local/gecko-test.db";

// Ensure parent directory exists
const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// Remove existing DB for a clean start
if (existsSync(dbPath)) {
  rmSync(dbPath);
  // Remove WAL/SHM artifacts
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
}

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ---------------------------------------------------------------------------
// Final schema (result of migrations 0001–0008 applied sequentially)
// ---------------------------------------------------------------------------

db.exec(`
-- focus_sessions (0001 + 0002: end_time nullable, synced_at default)
CREATE TABLE focus_sessions (
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

CREATE INDEX idx_sessions_user_time  ON focus_sessions(user_id, start_time);
CREATE INDEX idx_sessions_user_app   ON focus_sessions(user_id, app_name);
CREATE INDEX idx_sessions_device     ON focus_sessions(device_id);

-- api_keys (0001)
CREATE TABLE api_keys (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    key_hash    TEXT    NOT NULL UNIQUE,
    device_id   TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL,
    last_used   TEXT
);

CREATE INDEX idx_keys_user ON api_keys(user_id);

-- sync_logs (0001 + 0002: synced_at default)
CREATE TABLE sync_logs (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    session_count   INTEGER NOT NULL,
    first_start     REAL    NOT NULL,
    last_start      REAL    NOT NULL,
    synced_at       TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_user ON sync_logs(user_id, synced_at);

-- categories (0003)
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'folder',
  is_default INTEGER NOT NULL DEFAULT 0,
  slug       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_categories_user_slug ON categories (user_id, slug);

-- app_category_mappings (0003)
CREATE TABLE app_category_mappings (
  user_id     TEXT NOT NULL,
  bundle_id   TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id)
);

CREATE INDEX idx_acm_category ON app_category_mappings (category_id);

-- tags (0003)
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_tags_user_name ON tags (user_id, name);

-- app_tag_mappings (0003)
CREATE TABLE app_tag_mappings (
  user_id    TEXT NOT NULL,
  bundle_id  TEXT NOT NULL,
  tag_id     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id, tag_id)
);

CREATE INDEX idx_atm_tag ON app_tag_mappings (tag_id);

-- settings (0004)
CREATE TABLE settings (
  user_id    TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- daily_summaries (0005 + 0007 drop stats_json + 0008 add ai_prompt)
CREATE TABLE daily_summaries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  date            TEXT NOT NULL,
  ai_score        INTEGER,
  ai_result_json  TEXT,
  ai_model        TEXT,
  ai_generated_at TEXT,
  ai_prompt       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_daily_summaries_user_date ON daily_summaries(user_id, date);

-- app_notes (0006)
CREATE TABLE app_notes (
  user_id    TEXT NOT NULL,
  bundle_id  TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id)
);
`);

db.close();

console.log(`Local database initialized: ${dbPath}`);
