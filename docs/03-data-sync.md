# Data Sync

## Overview

Focus session data flows from the macOS client's local SQLite to the cloud Cloudflare D1 database via a batch sync protocol. The web dashboard reads from D1 to display per-user analytics.

```
┌─────────────┐    POST /api/sync     ┌──────────────────────┐    D1 REST API    ┌────────┐
│  macOS App   │ ── (API Key auth) ──>│  Web Dashboard       │ ────────────────>│ CF D1  │
│ local SQLite │   batch JSON body    │  (vinext on Bun)     │                   │ gecko  │
└─────────────┘                       └──────────────────────┘                   └────────┘
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
      "end_time": 1740600120.0,
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

**Field mapping:** The JSON field names use snake_case, matching the local SQLite column names. The server adds `user_id`, `device_id`, and `synced_at` before inserting into D1.

### Response

**Success (200):**

```json
{
  "inserted": 42,
  "duplicates": 3,
  "sync_id": "uuid-of-sync-log-entry"
}
```

**Errors:**

| Status | Meaning |
|---|---|
| 400 | Invalid JSON or empty sessions array |
| 401 | Missing or invalid API key |
| 413 | Batch too large (> 1000 sessions) |
| 500 | D1 write failure |

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
3. On success: update `lastSyncedStartTime` to the `start_time` of the last session in the batch
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
