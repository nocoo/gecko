# Data Sync

## Overview

Focus session data flows from the macOS client's local SQLite to the cloud Cloudflare D1 database via a batch sync protocol. The web dashboard reads from D1 to display per-user analytics.

```
┌─────────────┐    POST /api/sync     ┌──────────────────────┐                    ┌────────┐
│  macOS App   │ ── (API Key auth) ──>│  Web Dashboard       │                   │ CF D1  │
│ local SQLite │   batch JSON body    │  (vinext on Bun)     │                   │ gecko  │
└─────────────┘                       │                      │                   └────────┘
                                      │  ┌────────────────┐  │                       ▲
                                      │  │ In-Memory Queue │──│── async drain ───────┘
                                      │  │ (SyncQueue)     │  │   (2s interval,
                                      │  └────────────────┘  │    7 rows/batch)
                                      └──────────────────────┘
                                              │
                                     Session auth (Google OAuth)
                                              │
                                       ┌──────┴──────┐
                                       │ Dashboard UI │
                                       │  (per-user)  │
                                       └─────────────┘
```

---

## Authentication

Two separate auth mechanisms serve different clients:

### Dashboard: Google OAuth (session-based)

Users sign in via Google OAuth on the web dashboard. The session JWT contains `user.id` (Google OAuth `sub`), which scopes all queries to that user's data.

### macOS App: API Key (bearer token)

The macOS app authenticates with a pre-shared API key sent as a bearer token:

```
Authorization: Bearer gk_<random-hex>
```

**Key lifecycle:**

1. User signs into the dashboard
2. User navigates to Settings -> API Keys
3. User clicks "Generate API Key", provides a device name (e.g. "MacBook Pro")
4. Server generates a random key (`gk_` + 32 bytes hex), hashes it with SHA-256, stores the hash
5. Server generates a `device_id` (UUID) and binds it to this key
6. Returns `{ key, deviceId, name }` — the raw key is shown **once** and never stored server-side
7. User copies the key into the macOS app's Settings

**Key validation on sync:**

```
Request header: Authorization: Bearer gk_abc123...
    -> SHA-256(gk_abc123...) -> lookup in api_keys.key_hash
    -> found: extract user_id, device_id
    -> not found: 401 Unauthorized
```

The `last_used` field on the API key is updated on each successful sync.

---

## Sync Protocol

### Endpoint

```
POST /api/sync
Authorization: Bearer gk_<key>
Content-Type: application/json
```

### Request Body

```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "app_name": "Google Chrome",
      "window_title": "GitHub - gecko",
      "url": "https://github.com/user/gecko",
      "start_time": 1740600000.0,
      "duration": 120.0,
      "bundle_id": "com.google.Chrome",
      "tab_title": "gecko: Screen time tracker",
      "tab_count": 12,
      "document_path": null,
      "is_full_screen": false,
      "is_minimized": false
    }
  ]
}
```

**Field mapping:** The JSON field names use snake_case, matching the local SQLite column names. The server adds `user_id` and `device_id` before inserting into D1. `end_time` is not sent — the server/dashboard computes it as `start_time + duration`. `synced_at` is auto-populated by D1 via DEFAULT.

### Response

**Success (202 Accepted):**

```json
{
  "accepted": 42,
  "sync_id": "uuid-of-sync-log-entry"
}
```

The server validates sessions, enqueues them into an in-memory queue, and returns immediately. Sessions are written to D1 asynchronously by a background drain worker (every 2 seconds, 7 rows per multi-row INSERT — capped by D1's 100 bind parameter limit with 14 columns per row).

**Errors:**

| Status | Meaning |
|---|---|
| 400 | Invalid JSON or empty sessions array |
| 401 | Missing or invalid API key |
| 413 | Batch too large (> 1000 sessions) |

### Batch Size

Maximum 1000 sessions per request. The macOS client should chunk larger payloads.

### Idempotency

`INSERT OR IGNORE` on the `focus_sessions` table — if a session with the same `id` (UUID) already exists, it is silently skipped. This makes retries safe without deduplication logic on the client.

---

## macOS Client Sync Behavior

### Sync Trigger

The macOS app syncs on a timer interval (e.g. every 5 minutes). Only **finalized sessions** (where `duration > 0`) are synced — active sessions are excluded.

### Sync State Tracking

The macOS app tracks the last successfully synced `start_time` in UserDefaults:

```
Key: gecko.sync.lastSyncedStartTime
Value: Double (Unix timestamp)
```

On each sync cycle:

1. Query local SQLite: `SELECT * FROM focus_sessions WHERE start_time > ? AND duration > 0 ORDER BY start_time ASC LIMIT 1000`
2. POST to `/api/sync`
3. On **202 Accepted**: server has enqueued sessions — advance `lastSyncedStartTime` to the `start_time` of the last session in the batch
4. If more sessions remain: repeat immediately

### Failure Handling

- Network errors: retry on next timer tick (no backoff needed for personal use)
- 401 (invalid key): stop syncing, surface error in Settings UI
- 5xx: retry on next timer tick

---

## API Endpoints

### Sync (macOS app -> cloud)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sync` | API Key | Batch upload focus sessions |

### API Key Management (dashboard)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/keys` | Session | List current user's API keys |
| `POST` | `/api/keys` | Session | Generate new API key + device_id |
| `DELETE` | `/api/keys/[id]` | Session | Revoke an API key |

### Data Queries (dashboard)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sessions` | Session | List user's sessions (paginated, filterable) |
| `GET` | `/api/stats` | Session | Aggregated stats (by day, by app, etc.) |
| `GET` | `/api/sync/status` | Session | Sync health: last sync time, devices |
| `GET` | `/api/apps` | Session | List unique tracked apps (bundle_id, name, stats) |

### Categories & Tags (dashboard)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/categories` | Session | List categories (seeds 4 defaults on first access) |
| `POST` | `/api/categories` | Session | Create custom category (title + icon) |
| `PUT` | `/api/categories` | Session | Rename/update a custom category |
| `DELETE` | `/api/categories` | Session | Delete a custom category |
| `GET` | `/api/categories/mappings` | Session | List app→category mappings |
| `PUT` | `/api/categories/mappings` | Session | Batch upsert app→category mappings |
| `GET` | `/api/tags` | Session | List user's tags |
| `POST` | `/api/tags` | Session | Create a tag |
| `PUT` | `/api/tags` | Session | Rename a tag |
| `DELETE` | `/api/tags` | Session | Delete a tag (+ cascade remove mappings) |
| `GET` | `/api/tags/mappings` | Session | List app→tag mappings |
| `PUT` | `/api/tags/mappings` | Session | Batch upsert app→tag mappings |
| `POST` | `/api/tags/mappings` | Session | Replace all tags for given apps |

---

## D1 Access Layer

The web dashboard runs on Bun (not Cloudflare Workers), so D1 is accessed via the Cloudflare REST API:

```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query
Authorization: Bearer {cf_api_token}
Content-Type: application/json

{
  "sql": "SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY start_time DESC LIMIT ?",
  "params": ["google-oauth-sub-123", 50]
}
```

**Environment variables:**

```
CF_ACCOUNT_ID=<cloudflare-account-id>
CF_API_TOKEN=<d1-scoped-api-token>
CF_D1_DATABASE_ID=f66490d2-e7b3-43e8-a30c-2b34111141d7
```

The D1 client is encapsulated in `src/lib/d1.ts`, providing a typed interface over raw HTTP calls.

---

## Async Sync Queue

The sync endpoint (`POST /api/sync`) does **not** write to D1 in the request path. Instead, it validates sessions, enriches them with server-side fields (`user_id`, `device_id`), and enqueues them into an in-memory queue (`src/lib/sync-queue.ts`).

### Why

Each D1 REST API call takes ~100-300ms. Inserting 500 sessions one-by-one = ~100 seconds, which exceeds URLSession's 60-second timeout on the Mac client.

### Architecture

```
POST /api/sync          In-Memory Queue          Cloudflare D1
     │                       │                        │
     │── validate ──────────>│                        │
     │── enqueue ───────────>│                        │
     │<── 202 Accepted ──────│                        │
     │                       │                        │
     │                       │── drain (2s) ────────> │
     │                       │   multi-row INSERT     │
     │                       │   (7 rows/batch)      │
     │                       │                        │
     │                       │── drain (2s) ────────> │
     │                       │   ...                  │
```

### Key design decisions

1. **In-memory queue** (not file-based) — process restart data loss is acceptable; Mac client re-syncs on next tick, `INSERT OR IGNORE` is idempotent
2. **Multi-row INSERT** — batch 7 sessions into a single `INSERT OR IGNORE INTO ... VALUES (...), (...), ...` statement (14 columns × 7 rows = 98 params, under D1's 100 limit)
3. **Fire-and-forget drain** — drain errors are logged but don't block future drains. Mac re-syncs naturally
4. **Concurrency guard** — `drain()` is a no-op if already draining, preventing overlapping writes
5. **Module-level singleton** — `getSyncQueue()` returns a shared instance for the Bun process lifetime

---

## Data Isolation

All cloud queries are scoped by `user_id`:

- **Dashboard queries:** `user_id` extracted from JWT session (`session.user.id`)
- **Sync uploads:** `user_id` resolved from API key hash lookup in `api_keys` table
- **No cross-user access:** There is no admin endpoint or cross-user query path

```sql
-- Every query includes user_id scoping
SELECT * FROM focus_sessions WHERE user_id = ? AND start_time > ? ORDER BY start_time DESC;
SELECT * FROM api_keys WHERE user_id = ?;
SELECT * FROM sync_logs WHERE user_id = ? ORDER BY synced_at DESC;
```

---

## Sync Log

Each successful batch upload creates a `sync_logs` entry:

```sql
INSERT INTO sync_logs (id, user_id, device_id, session_count, first_start, last_start, synced_at)
VALUES (?, ?, ?, ?, ?, ?, ?);
```

The dashboard uses sync logs to display:

- Last sync time per device
- Total sessions synced
- Sync frequency / health indicators

---

## App Categories & Tags

### Overview

Apps tracked by the macOS client can be organized into **categories** (one per app) and **tags** (zero or more per app) on the web dashboard. Both are per-user — each user has their own categories, tags, and mappings.

### Categories

- **One app → one category** (required assignment via `app_category_mappings`)
- 4 default categories seeded on first access: `system-core`, `system-app`, `browser`, `application`
- ~95 known `bundle_id` → category auto-mappings seeded alongside defaults
- Default categories cannot be edited or deleted (`is_default = 1`)
- Users can create custom categories with a title + Lucide icon name
- Display: Colored pill with icon + label, color derived from stable hash of slug

### Tags

- **One app → 0-N tags** (optional, many-to-many via `app_tag_mappings`)
- No defaults — users create all tags
- Display: Colored pill with label only (no icon), color from stable hash of name
- Tag assignment uses a "replace all" pattern — POST sends the complete tag set per app

### Color System

Both categories and tags use `getHashColor(input)` for display colors:

- **djb2 hash** of the input string → hue `% 360`
- `fg`: `hsl(H, 65%, 45%)` — saturated foreground for text
- `bg`: `hsl(H, 60%, 92%)` — light background for pills
- Chinese-compatible since JS strings are UTF-16 (`charCodeAt`)

### D1 Schema (migration 0003)

```sql
-- Categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT DEFAULT 'folder',
  is_default INTEGER DEFAULT 0,
  slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_categories_user_slug ON categories(user_id, slug);

-- App → Category (one-to-one per user)
CREATE TABLE app_category_mappings (
  user_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id)
);

-- Tags
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_tags_user_name ON tags(user_id, name);

-- App → Tags (many-to-many per user)
CREATE TABLE app_tag_mappings (
  user_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bundle_id, tag_id)
);
```

---

## Implementation Progress

| Component | Status | Notes |
|---|---|---|
| D1 REST API client (`src/lib/d1.ts`) | Done | 10 tests |
| API key utilities (`src/lib/api-key.ts`) | Done | 8 tests |
| Auth helpers (`src/lib/api-helpers.ts`) | Done | 13 tests |
| `POST /api/keys` — create key | Done | |
| `GET /api/keys` — list keys | Done | |
| `DELETE /api/keys/[id]` — revoke key | Done | |
| `POST /api/sync` — batch upload (202) | Done | 10 tests, enqueues to in-memory queue |
| Sync queue (`src/lib/sync-queue.ts`) | Done | 22 tests: drain, batching, concurrency, D1 param boundary, schema-drift guard |
| `GET /api/sessions` — list sessions | Done | Paginated, computes `end_time` as `start_time + duration` |
| `GET /api/stats` — aggregated stats | Done | Period filter (today/week/month/all) |
| `GET /api/sync/status` — sync health | Done | Per-device last sync |
| `GET /api/apps` — list tracked apps | Done | 4 tests, unique bundle_id + stats |
| Settings page — API key management UI | Done | Create, list, revoke keys with dialogs |
| Dashboard page — real data from D1 | Done | Period selector, stat cards, top apps table |
| Hash color utility (`src/lib/hash-color.ts`) | Done | 9 tests, djb2 hash → HSL fg/bg/bgSubtle |
| Default categories + seed logic | Done | 17 tests (10 constant validation + 7 seeding logic) |
| CategoryPill + TagBadge components | Done | Static ICON_MAP, hash color pills |
| Sidebar sub-navigation | Done | 25 tests, Settings → General/Categories/Tags |
| `/api/categories` CRUD | Done | GET (with auto-seeding), POST, PUT, DELETE |
| `/api/categories/mappings` GET/PUT | Done | 6 tests, batched upsert |
| `/api/tags` CRUD | Done | 9 tests, GET/POST/PUT/DELETE |
| `/api/tags/mappings` GET/PUT/POST | Done | 11 tests, upsert + replace-all-per-app |
| Categories settings page | Done | CRUD dialogs + icon picker + app mapping UI |
| Tags settings page | Done | CRUD dialogs + expandable multi-tag assignment |
| macOS `DatabaseManager` additions | Done | `fetchUnsynced(since:limit:)` — watermark-based query |
| macOS `SettingsManager` sync settings | Done | apiKey, syncEnabled, syncServerUrl, lastSyncedStartTime |
| macOS `SyncService.swift` | Done | Timer-based (5m), batch upload, 202 support, 14 tests |
| macOS `SettingsViewModel` sync state | Done | Two-way binding, sync actions, SyncService forwarding |
| macOS `SettingsView` sync UI | Done | Toggle, API key, server URL, status display, Sync Now |
| macOS `GeckoApp` wiring | Done | SyncService instantiated and passed to SettingsViewModel |
| macOS tests | Done | 185 total tests, 0 lint violations |
| Web dashboard tests | Done | 258 unit tests (0 lint errors) + 25 E2E tests |
| Git hooks (husky) | Done | pre-commit: UT (both platforms), pre-push: UT + Lint + E2E |
| E2E test infrastructure | Done | BDD-style tests, self-managed server on port 10728 |

---

## Test Coverage

### Three-Layer Verification

| Layer | Tool | Hook | Description |
|---|---|---|---|
| **Unit Tests** | `bun test` + `xcodebuild test` | pre-commit | 185 mac + 258 web = 443 total tests |
| **Lint** | SwiftLint + ESLint | pre-push | 0 violations, 0 errors |
| **E2E** | `bun run test:e2e` | pre-push (when present) | 25 integration tests against live server |

### E2E Test Scenarios

Run via `bun run test:e2e` (sets `RUN_E2E=true`, starts server on port 10728):

**Sync round-trip (`sync-roundtrip.test.ts`):**

1. **New client sync** — POST sessions without `end_time` -> 202 Accepted -> sessions API returns computed `end_time`
2. **Backward-compatible sync** — Old client sends `end_time` in payload -> server accepts gracefully
3. **Validation** — Missing required fields -> 400, Empty sessions array -> 400
4. **Batch size enforcement** — >1000 sessions -> 413

**Categories & Tags (`categories-tags.test.ts`):**

5. **Categories CRUD** — GET seeds defaults -> POST creates custom -> PUT renames -> DELETE removes
6. **Tags CRUD** — GET returns list -> POST creates -> PUT renames -> DELETE removes (+ cascade)
7. **Category mappings** — Sync a session -> PUT assigns app to category -> GET confirms mapping
8. **Tag mappings** — POST assigns multiple tags -> GET confirms -> POST replaces (remove one) -> POST with empty tagIds clears all

### Running Tests

```bash
# Unit tests only (both platforms, runs on every commit)
bun test                            # web dashboard
cd apps/mac-client && xcodebuild test -scheme GeckoTests -destination 'platform=macOS'

# Lint (runs on push)
cd apps/web-dashboard && bun run lint
cd apps/mac-client && swiftlint lint --strict

# E2E tests (explicit invocation)
cd apps/web-dashboard && bun run test:e2e
```
