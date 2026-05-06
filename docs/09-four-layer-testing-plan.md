# Four-Layer Testing Improvement Plan

> Execution plan to align Gecko's test infrastructure with the four-layer testing standard.
> **Status: COMPLETED** (v1.2.0). All three phases are implemented. This document is retained as a design reference.

## Current Status

| Layer | Standard | Status | Notes |
|-------|----------|--------|-------|
| L1: Unit Tests | 90%+ coverage, pre-commit gate | **PASS** | 608 web + 194 mac, pre-commit hook |
| L2: Lint | Strict mode, zero tolerance | **PASS** | ESLint `strict` + SwiftLint `--strict` |
| L3: API E2E | 100% REST API coverage, pre-push gate | **PASS** | 11 test files on port 17018, pre-push hook |
| L4: BDD E2E | Playwright browser tests for core flows | **PASS** | 6 spec files on port 27018, on-demand |

## Phase 1 — Fix Bugs + Lint Upgrade (Critical) ✓

### 1.1 Fix pre-push E2E silent skip

**Problem**: `.husky/pre-push` runs `bun test src/__tests__/e2e/` without `RUN_E2E=true`,
so all E2E tests are silently skipped by `describe.skipIf(!process.env.RUN_E2E)`.

**Fix**:
- Add `RUN_E2E=true` to the pre-push E2E command
- Add E2E dev server auto-start/stop logic to the hook
- Add port conflict detection (kill stale processes before starting)

### 1.2 ESLint → strict

**Problem**: ESLint uses `tseslint.configs.recommended` (mid-tier). Missing safety rules like
`no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-member-access`.

**Fix** (implemented):
- `eslint.config.mjs`: switched to `tseslint.configs.strict` (not `strictTypeChecked` — decided against type-aware linting for build speed)
- All violations fixed

### 1.3 SwiftLint → strict mode

**Problem**: `swiftlint lint` treats warnings as non-blocking. Pre-push hook counts JSON
violations but may miss warning-level issues.

**Fix**:
- Pre-push hook: change to `swiftlint lint --strict`
- Fix any new violations that surface

## Phase 2 — API E2E Completion ✓

### 2.1 Port standardization

| Purpose | Current | Target |
|---------|---------|--------|
| Dev server | 7018 | 7018 (unchanged) |
| API E2E server | 10728 | 17018 |
| BDD E2E server | N/A | 27018 |

Update: `dev:e2e` script, all E2E test files, pre-push hook.

### 2.2 E2E server auto-management

E2E tests spawn the dev server automatically via `bun run dev:e2e`.
The server uses `D1_LOCAL_PATH=.local/gecko-test.db` (local SQLite) — no
remote Cloudflare D1 dependency. Database is initialized fresh by
`scripts/init-local-db.ts` before each test run.

### 2.3 Fill uncovered API routes

**High priority** (security/public-facing):

| E2E Test File | Routes Covered |
|---------------|---------------|
| `keys-roundtrip.test.ts` | `GET/POST /api/keys`, `PATCH/DELETE /api/keys/[id]` |
| `public-api.test.ts` | `GET /api/v1/snapshot` (with API key auth) |

**Medium priority** (core data):

| E2E Test File | Routes Covered |
|---------------|---------------|
| `stats.test.ts` | `GET /api/stats`, `GET /api/stats/timeline` |
| `timezone-settings.test.ts` | `GET/PUT /api/settings/timezone` |
| `app-notes.test.ts` | `GET/PUT/DELETE /api/apps/notes`, `GET /api/apps` |
| `sync-status.test.ts` | `GET /api/sync/status` |

**Excluded** (acceptable gaps):
- `/api/auth/[...nextauth]` — third-party NextAuth, tested by library
- `/api/live` — trivial probe, used as health check in test setup

**Target: 25/27 routes covered (93%).**

### 2.4 Update pre-push hook

Pre-push runs `bun run test:e2e` (which calls `db:init` then the test suite)
and `bun run gate:security` in parallel. No remote D1 verification needed.

## Phase 3 — BDD E2E (Playwright) ✓

### 3.1 Install and configure Playwright

- `bun add -d @playwright/test`
- `bunx playwright install chromium`
- Create `playwright.config.ts` with:
  - `testDir: './src/__tests__/bdd'`
  - `baseURL: 'http://localhost:27018'`
  - `webServer` config for auto-start on port 27018
  - Screenshot on failure

### 3.2 Core user flow BDD tests

| Test File | User Flow |
|-----------|-----------|
| `dashboard.spec.ts` | Load dashboard → verify stats cards → switch date range |
| `daily-review.spec.ts` | Navigate to daily review → see timeline → trigger AI analysis |
| `settings.spec.ts` | Open settings → change timezone → save → verify persisted |
| `categories.spec.ts` | Create category → add mapping → verify app categorized |
| `tags.spec.ts` | Create tag → assign to app → verify tag displayed |
| `navigation.spec.ts` | Sidebar navigation → page transitions → URL verification |

> **Note**: `backy.spec.ts` was originally planned but not implemented. `tags.spec.ts` and `navigation.spec.ts` were added instead.

### 3.3 BDD E2E integration

> **Decision**: BDD E2E was initially added to the pre-push hook but later removed. BDD tests run on-demand via `bun run test:bdd` to keep push times reasonable. API E2E remains in pre-push.

### 3.4 Add npm scripts

```json
"test:bdd": "bunx playwright test",
"dev:bdd": "E2E_SKIP_AUTH=true vinext dev --port 27018"
```

## Execution Order

```
Phase 1.1  Fix pre-push E2E skip bug          ✓ Done
Phase 1.2  ESLint strict                       ✓ Done (strict, not strictTypeChecked)
Phase 1.3  SwiftLint --strict                  ✓ Done
Phase 2.1  Port standardization                ✓ Done (17018 / 27018)
Phase 2.2  E2E server auto-management          ✓ Done (local SQLite via D1_LOCAL_PATH)
Phase 2.3  Fill uncovered API E2E tests        ✓ Done (11 test files)
Phase 2.4  Update pre-push hook                ✓ Done
Phase 3.1  Install Playwright                  ✓ Done
Phase 3.2  Write BDD tests                     ✓ Done (6 specs, 21 tests)
Phase 3.3  BDD integration                     ✓ Done (on-demand, not pre-push)
```
