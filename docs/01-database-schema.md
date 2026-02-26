# Database Schema

## Overview

Gecko uses two databases: a **local SQLite** on each macOS device for real-time data collection, and a **cloud Cloudflare D1** database for cross-device aggregation and dashboard queries.

| Aspect | Local (macOS) | Cloud (D1) |
|---|---|---|
| Engine | SQLite via GRDB.swift | Cloudflare D1 (SQLite-compatible) |
| Path | `~/Library/Application Support/com.gecko.app/gecko.sqlite` | `gecko` (ID: `f66490d2-e7b3-43e8-a30c-2b34111141d7`) |
| Access | macOS app direct file I/O | Web dashboard via D1 REST API |
| Mode | WAL, foreign keys enabled | Serverless, managed by Cloudflare |
| Scope | Single device, all sessions | Multi-user, multi-device |

---

## Local Database (macOS)

### `focus_sessions`

Records focus sessions — one row per window/tab switch. See [02-data-collection.md](./02-data-collection.md) for how data is collected.

| Column | SQLite Type | Constraint | Migration | Description |
|---|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | v1 | UUID string from `UUID().uuidString` |
| `app_name` | TEXT | NOT NULL | v1 | App display name, e.g. "Google Chrome" |
| `window_title` | TEXT | NOT NULL | v1 | Focused window title |
| `url` | TEXT | nullable | v1 | Browser tab URL (nil for non-browsers) |
| `start_time` | DOUBLE | NOT NULL | v1 | Session start (Unix timestamp, seconds) |
| `end_time` | DOUBLE | NOT NULL | v1 | Session end (Unix timestamp, seconds) |
| `duration` | DOUBLE | NOT NULL, DEFAULT 0 | v1 | Redundant: `end_time - start_time` |
| `bundle_id` | TEXT | nullable | v2 | App bundle ID, e.g. "com.google.Chrome" |
| `tab_title` | TEXT | nullable | v2 | Browser tab title |
| `tab_count` | INTEGER | nullable | v2 | Open tab count in browser front window |
| `document_path` | TEXT | nullable | v2 | Editor/IDE document path via AXDocument |
| `is_full_screen` | BOOLEAN | DEFAULT false | v2 | AXFullScreen window state |
| `is_minimized` | BOOLEAN | DEFAULT false | v2 | AXMinimized window state |

### Local Migrations

#### v1: `v1_create_focus_sessions`

```sql
CREATE TABLE focus_sessions (
    id           TEXT PRIMARY KEY,
    app_name     TEXT NOT NULL,
    window_title TEXT NOT NULL,
    url          TEXT,
    start_time   DOUBLE NOT NULL,
    end_time     DOUBLE NOT NULL,
    duration     DOUBLE NOT NULL DEFAULT 0
);
```

#### v2: `v2_add_rich_context`

```sql
ALTER TABLE focus_sessions ADD COLUMN bundle_id       TEXT;
ALTER TABLE focus_sessions ADD COLUMN tab_title       TEXT;
ALTER TABLE focus_sessions ADD COLUMN tab_count       INTEGER;
ALTER TABLE focus_sessions ADD COLUMN document_path   TEXT;
ALTER TABLE focus_sessions ADD COLUMN is_full_screen  BOOLEAN DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN is_minimized    BOOLEAN DEFAULT 0;
```

### CRUD Operations

Via `DatabaseService` protocol (dependency-injectable, testable with in-memory DB):

| Method | Description |
|---|---|
| `insert(_:)` | Insert new session |
| `update(_:)` | Update existing session (e.g. finalize with duration) |
| `save(_:)` | Upsert (insert or update) |
| `fetchRecent(limit:)` | Fetch recent sessions ordered by `start_time DESC` |
| `fetch(id:)` | Fetch single session by primary key |
| `count()` | Total session count |
| `deleteAll()` | Truncate all sessions |

---

## Cloud Database (Cloudflare D1)

### `focus_sessions`

Mirrors the local schema with three additional columns for multi-user and multi-device support.

| Column | D1 Type | Constraint | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID from macOS app (same as local) |
| `user_id` | TEXT | NOT NULL | Google OAuth `sub` (owner identity) |
| `device_id` | TEXT | NOT NULL | Device UUID from `api_keys` table |
| `app_name` | TEXT | NOT NULL | App display name |
| `window_title` | TEXT | NOT NULL | Focused window title |
| `url` | TEXT | nullable | Browser tab URL |
| `start_time` | REAL | NOT NULL | Unix timestamp (seconds) |
| `end_time` | REAL | NOT NULL | Unix timestamp (seconds) |
| `duration` | REAL | NOT NULL, DEFAULT 0 | `end_time - start_time` |
| `bundle_id` | TEXT | nullable | App bundle ID |
| `tab_title` | TEXT | nullable | Browser tab title |
| `tab_count` | INTEGER | nullable | Open tab count |
| `document_path` | TEXT | nullable | Editor document path |
| `is_full_screen` | INTEGER | DEFAULT 0 | 0/1 boolean |
| `is_minimized` | INTEGER | DEFAULT 0 | 0/1 boolean |
| `synced_at` | TEXT | NOT NULL | ISO 8601 upload timestamp |

**Indexes:**

```sql
CREATE INDEX idx_sessions_user_time  ON focus_sessions(user_id, start_time);
CREATE INDEX idx_sessions_user_app   ON focus_sessions(user_id, app_name);
CREATE INDEX idx_sessions_device     ON focus_sessions(device_id);
```

### `api_keys`

API keys for macOS app authentication. Each key is bound to one user and one device.

| Column | D1 Type | Constraint | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `user_id` | TEXT | NOT NULL | Owner (Google OAuth `sub`) |
| `name` | TEXT | NOT NULL | User-given name, e.g. "MacBook Pro" |
| `key_hash` | TEXT | NOT NULL, UNIQUE | SHA-256 hash of raw API key |
| `device_id` | TEXT | NOT NULL, UNIQUE | Generated UUID for this device |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `last_used` | TEXT | nullable | ISO 8601, updated on each sync |

**Indexes:**

```sql
CREATE INDEX idx_keys_user ON api_keys(user_id);
```

### `sync_logs`

Audit trail for each batch upload from macOS app.

| Column | D1 Type | Constraint | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `user_id` | TEXT | NOT NULL | Owner |
| `device_id` | TEXT | NOT NULL | Source device |
| `session_count` | INTEGER | NOT NULL | Sessions in this batch |
| `first_start` | REAL | NOT NULL | Earliest `start_time` in batch |
| `last_start` | REAL | NOT NULL | Latest `start_time` in batch |
| `synced_at` | TEXT | NOT NULL | ISO 8601 |

**Indexes:**

```sql
CREATE INDEX idx_sync_user ON sync_logs(user_id, synced_at);
```

### Cloud Migration: `v1_cloud_init`

```sql
CREATE TABLE focus_sessions (
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

CREATE INDEX idx_sessions_user_time  ON focus_sessions(user_id, start_time);
CREATE INDEX idx_sessions_user_app   ON focus_sessions(user_id, app_name);
CREATE INDEX idx_sessions_device     ON focus_sessions(device_id);

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

CREATE TABLE sync_logs (
    id              TEXT    PRIMARY KEY,
    user_id         TEXT    NOT NULL,
    device_id       TEXT    NOT NULL,
    session_count   INTEGER NOT NULL,
    first_start     REAL    NOT NULL,
    last_start      REAL    NOT NULL,
    synced_at       TEXT    NOT NULL
);

CREATE INDEX idx_sync_user ON sync_logs(user_id, synced_at);
```

---

## Design Decisions

### `duration` is a redundant field

`duration` always equals `end_time - start_time`. Kept to simplify aggregation queries without runtime computation.

### `isActive` is a computed property

Active sessions have `duration == 0 && endTime == startTime`. Not stored in DB — determined at read time.

### Empty string vs nil

Nullable fields treat `""` and `nil` as distinct values. Empty strings are stored as-is.

### Local DOUBLE vs Cloud REAL

Local SQLite uses `DOUBLE` (GRDB convention), cloud D1 uses `REAL` (standard SQLite affinity). Both store IEEE 754 doubles — fully compatible.

### D1 uses INTEGER for booleans

D1 has no native BOOLEAN type. `is_full_screen` and `is_minimized` use `INTEGER DEFAULT 0` (0 = false, 1 = true).

### Idempotent sync via UUID primary key

`focus_sessions.id` is the same UUID on local and cloud. `INSERT OR IGNORE` ensures duplicate uploads are harmless. See [03-data-sync.md](./03-data-sync.md) for the sync protocol.

### Multi-user data isolation

All cloud queries filter by `user_id`. The `user_id` is derived from the authenticated session (dashboard) or from the API key lookup (sync endpoint). Users cannot access other users' data.

### CodingKeys mapping (macOS client)

| Swift Property | DB Column |
|---|---|
| `appName` | `app_name` |
| `windowTitle` | `window_title` |
| `startTime` | `start_time` |
| `endTime` | `end_time` |
| `bundleId` | `bundle_id` |
| `tabTitle` | `tab_title` |
| `tabCount` | `tab_count` |
| `documentPath` | `document_path` |
| `isFullScreen` | `is_full_screen` |
| `isMinimized` | `is_minimized` |
