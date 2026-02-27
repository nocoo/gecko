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
| Sync queue (`src/lib/sync-queue.ts`) | Done | 16 tests, background drain + multi-row INSERT |
| `GET /api/sessions` — list sessions | Done | Paginated |
| `GET /api/stats` — aggregated stats | Done | Period filter (today/week/month/all) |
| `GET /api/sync/status` — sync health | Done | Per-device last sync |
| Settings page — API key management UI | Done | Create, list, revoke keys with dialogs |
| Dashboard page — real data from D1 | Done | Period selector, stat cards, top apps table |
| macOS `DatabaseManager` additions | Done | `fetchUnsynced(since:limit:)` — watermark-based query |
| macOS `SettingsManager` sync settings | Done | apiKey, syncEnabled, syncServerUrl, lastSyncedStartTime |
| macOS `SyncService.swift` | Done | Timer-based (5m), batch upload, 202 support, 14 tests |
| macOS `SettingsViewModel` sync state | Done | Two-way binding, sync actions, SyncService forwarding |
| macOS `SettingsView` sync UI | Done | Toggle, API key, server URL, status display, Sync Now |
| macOS `GeckoApp` wiring | Done | SyncService instantiated and passed to SettingsViewModel |
| macOS tests | Done | 185 total tests, 0 lint violations |
| Web dashboard tests | Done | 165 total tests, 0 lint errors |
