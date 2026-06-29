# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.10.12] - 2026-06-29

### Added
- **daily**: redesign date navigator with score ring calendar

### Fixed
- **analyze**: harden JSON output prompt and surface raw text in UI
- **analyze**: raise AI timeout 55s -> 120s for large-day prompts

## [1.10.11] - 2026-06-29

### Added
- **ai**: support Bearer auth header for custom LLM gateways

### Fixed
- **ai-test**: surface upstream provider errors instead of generic 502

## [1.10.10] - 2026-06-29

### Added
- **sync**: per-batch resilience + UI progress display

### Fixed
- **docker**: runtime on node:22, not bun — bun hangs vinext's req.json on >80KB POSTs
- **proxy**: skip auth() wrapper for Bearer-auth POSTs so body stream survives

### Maintenance
- **sync**: URLSession.shared in release builds — recover pre-1.10.2 plumbing

### Other
- **sync**: split body read from JSON parse to isolate hang
- **sync**: instrument server route to find where real-key reqs hang

## [1.10.9] - 2026-06-29

### Maintenance
- **sync**: upgrade key log lines to .notice + Connection: close + init log

### Other
- **sync**: URLSession.shared + 250-row batches — match pre-6/27 behaviour

## [1.10.8] - 2026-06-28

### Fixed
- **sync**: skip wedged batches, shrink batch size, drop ephemeral session

## [1.10.7] - 2026-06-28

### Fixed
- **sync**: fail fast per batch, surface progress in Settings UI

## [1.10.6] - 2026-06-28

### Fixed
- **sync**: force HTTP/2 over TCP, drop HTTP/3 (QUIC) for upload

## [1.10.5] - 2026-06-27

### Maintenance
- **sync**: expose all SyncService log fields publicly for prod debugging

## [1.10.4] - 2026-06-27

### Fixed
- **sync**: resetSyncState returns false when clearSyncedState throws
- **sync**: block Reset mid-cycle to avoid stomping in-flight markSynced
- **sync**: Reset sync state must also clear per-row synced_at

## [1.10.3] - 2026-06-27

### Added
- **sync**: resumable per-row sync state, no more wedged backlogs

## [1.10.2] - 2026-06-27

### Fixed
- **sync**: smaller batches + longer URLSession timeout to drain Mac backlog

## [1.10.1] - 2026-06-27

### Fixed
- **sidebar**: align collapsed-view logo padding with expanded view to stop jitter
- **image**: mark logo PNGs as unoptimized to bypass vinext srcset bug
- **proxy**: let Bearer-authenticated API requests bypass session redirect
- **web-dashboard**: make local E2E self-contained
- **docker**: skip lifecycle scripts in bun install to avoid better-sqlite3 native build

### CI
- enable L3 BDD in CI via base-ci
- enable L3 Playwright BDD tests in CI

### Maintenance
- **deps**: bump ai 6 -> 7, @ai-sdk/openai 3 -> 4, @ai-sdk/anthropic 3 -> 4
- **deps**: bump @ai-sdk/anthropic 3.0.85 -> 3.0.86 (patch, #140)
- **deps**: bump vite 8.0.16 -> 8.1.0 (minor, #138)
- **deps**: bump vinext 0.1.7 -> 0.1.8 (patch, #137)
- **deps**: bump recharts 3.8.1 -> 3.9.0 (minor, #136)
- **deps**: bump hono 4.12.26 -> 4.12.27 (patch, #135)
- **deps**: bump ai 6.0.208 -> 6.0.209 (patch, #134)
- **deps**: bump @vitejs/plugin-react 6.0.2 -> 6.0.3 (patch, #133)
- **deps**: bump @playwright/test 1.61.0 -> 1.61.1 (patch, #132)
- **deps**: bump vinext 0.1.6 -> 0.1.7 (patch, #130)
- **deps**: bump typescript-eslint 8.61.1 -> 8.62.0 (minor, #129)
- **deps**: bump @hono/node-server 2.0.5 -> 2.0.6 (patch, #128)
- **deps**: bump @ai-sdk/openai 3.0.73 -> 3.0.74 (patch, #127)
- **deps**: bump lint-staged 17.0.7 -> 17.0.8 (patch, #125)
- **deps**: bump lucide-react 1.20.0 -> 1.21.0 (minor, #120)
- **deps**: bump hono 4.12.25 -> 4.12.26 (patch, #119)
- **deps**: bump vinext 0.1.4 -> 0.1.6 (patch, #123)
- **ci**: pin base-ci reusable workflow to v2026.5 SHA
- **deps**: batch dependency upgrade (2 packages, #116-#117)
- **deps**: bump vinext 0.1.3 -> 0.1.4 (patch, #114)
- **deps**: bump lucide-react 1.18.0 -> 1.20.0 (minor, #113)
- **deps**: bump ai 6.0.206 -> 6.0.207 (patch, #112)
- **deps**: bump @ai-sdk/openai 3.0.71 -> 3.0.72 (patch, #111)
- **deps**: bump @ai-sdk/anthropic 3.0.84 -> 3.0.85 (patch, #110)
- **deps**: bump vinext 0.1.2 -> 0.1.3 (patch, #106)
- **deps**: bump typescript-eslint 8.61.0 -> 8.61.1 (patch, #105)
- **deps**: bump radix-ui 1.5.0 -> 1.6.0 (minor, #104)
- **deps**: bump better-sqlite3 12.10.1 -> 12.11.1 (minor, #102)
- **deps**: bump ai 6.0.205 -> 6.0.206 (patch, #101)
- **deps**: bump vitest & @vitest/coverage-v8 4.1.8 -> 4.1.9 (patch, #108 #100)
- **deps**: bump @playwright/test 1.60.0 -> 1.61.0 (minor, #99)
- **deps**: bump @hono/node-server 2.0.4 -> 2.0.5 (patch, #98)
- **deps**: pin vite >=8.0.16 via override to drop vulnerable 7.3.3 (security GHSA-fx2h-pf6j-xcff, #107)
- **deps**: bump @babel/core 7.29.0 -> 7.29.7 via override (security GHSA, #97)
- **deps**: bump js-yaml 4.1.1 -> 4.2.0 via override (security GHSA, #103)
- **deps**: bump ai 6.0.204 -> 6.0.205 (patch)
- **deps**: bump better-sqlite3 12.10.0 -> 12.10.1 (patch)
- **deps**: bump @ai-sdk/anthropic 3.0.83 -> 3.0.84 (patch)
- **deps**: bump @ai-sdk/openai 3.0.70 -> 3.0.71 (patch)
- **deps**: bump ai 6.0.202 -> 6.0.204 (patch)
- **deps**: bump eslint 10.4.1 -> 10.5.0 (minor)
- **deps**: bump lucide-react 1.17.0 -> 1.18.0 (minor)
- **deps**: bump tailwindcss & @tailwindcss/postcss 4.3.0 -> 4.3.1 (patch)
- **deps**: bump vinext 0.1.1 -> 0.1.2 (patch)
- **deps**: bump ai 6.0.200 -> 6.0.202 (patch)
- **deps**: bump @ai-sdk/openai 3.0.69 -> 3.0.70 (patch)
- **deps**: bump @ai-sdk/anthropic 3.0.82 -> 3.0.83 (patch)
- **deps**: bump @vitejs/plugin-react 5.2.0 -> 6.0.2 (major)
- **deps**: bump ai 6.0.199 -> 6.0.200 (patch)

### Tests
- **web-dashboard**: mock better-sqlite3 in live.test so CI without native addon passes
- **l3**: rewrite dashboard spec to BDD style
- **l3**: remove unstable BDD specs, keep dashboard smoke test

## [1.10.0] - 2026-06-10

### Fixed
- **lint**: silence ESLint 10 warn-ignored on vinext-generated files
- **auth**: make next-auth survive vinext 0.1.x's NextRequest spread
- **hooks**: guard mac-client swiftlint+xcodebuild behind toolchain check

### CI
- harden gecko against Shai-Hulud (base-ci@v2026.4, --ignore-scripts)

### Documentation
- add retrospective for better-sqlite3 ABI mismatch

### Maintenance
- **deps**: bump radix-ui 1.4.3 -> 1.5.0
- **deps**: override qs to ^6.15.2 (security)
- **deps**: bump next 16.2.7 -> 16.2.9 (patches)
- **deps**: bump hono 4.12.18 -> 4.12.25 (security)
- **deps**: bump AI SDK / @types/bun / express-rate-limit patches
- **deps**: bump vinext 0.0.9 -> 0.1.1 + vite 7 -> 8.0.16 (coupled)
- **deps**: bump lint-staged 16.4.0 -> 17.0.7
- **deps**: bump eslint 9 -> 10
- **deps**: bump typescript 5.x -> 6.0.3
- **deps**: bump shadcn 3.8.5 -> 4.11.0
- **deps**: bump react-day-picker 9.14.0 -> 10.0.1
- **deps**: bump lucide-react 0.575.0 -> 1.17.0
- **deps**: bump @hono/node-server 1.19.13 -> 2.0.4
- **deps**: bump misc minor/patch (hono, recharts, sqlite, etc.)
- **deps**: bump tailwind family to latest minors
- **deps**: bump test tooling patches
- **deps**: bump AI SDK, react and types to latest patches
- **mac-client**: remove superfluous swiftlint:disable in SyncServiceTests
- **deps**: upgrade next to 16.2.7
- **deps**: upgrade next to 16.2.6

## [1.9.0] - 2026-05-09

### Added
- **live**: upgrade /api/live to surety standard
- add automated release script
- **ui**: add success/warning/info badge variants

### Fixed
- **mac**: make auto-start watcher persistent instead of time-bounded
- **mac**: replace polling with reactive Combine for auto-start tracking
- **bdd**: resolve Playwright strict mode violations in rename/edit tests
- **web**: use better-sqlite3 for local D1 mode (Node/vinext compatible)
- **gecko**: use vi.stubEnv for NODE_ENV in backy-push.test.ts
- **coverage**: remove core module exclusions, add tests for backy-push/daily-stats/analyze-core
- **ui**: align bg-card usage to B05 luminance spec
- **test**: replace Function type with explicit callable signature
- **test**: rewrite live.test.ts to use fetch mock instead of mock.module
- **lint**: remove unused afterEach import
- **ui**: add hover border darkening to Input and Select
- **ui**: tab switcher bg-background → bg-card
- **ui**: migrate L3 controls from bg-input to bg-secondary + border-border
- **ui**: remove border from L1 bg-card containers in daily components
- **assets**: remove unreferenced logo-192.png
- **ui**: chart tooltips to bg-secondary without border/shadow
- **ui**: empty state to bg-secondary without border-dashed

### Changed
- **web**: replace remote D1 test database with local SQLite

### CI
- **l2**: add test:l2 script and enable L2 gate in CI
- upgrade base-ci to v2026.1
- retrigger (flaky test)
- retrigger

### Maintenance
- **deps**: fix 4 medium-severity vulnerabilities
- **web**: add vitest config and replace bun:test infra
- **deps**: upgrade @nocoo/next-ai to ^0.2.1
- **g1**: add typecheck script
- **quality**: 6DQ L1+G1 compliance — add CI workflow (#9)

### Style
- fix HTML title language to match UI (gecko - Screen Time Dashboard)
- unify HTML title to "gecko - 屏幕时间追踪面板
- **login**: GitHub icon size-5 → h-[18px] w-[18px]
- **shell**: GitHub icon size-5 → h-[18px] w-[18px]
- **sidebar**: brand name tracking-tight → tracking-tighter

### Tests
- **l2**: add L2 tests for sync-status route
- **l2**: add L2 tests for daily routes
- **l2**: add L2 tests for stats route
- **l2**: add L2 tests for settings routes
- **l2**: add L2 tests for sessions route
- **web**: migrate test imports from bun:test to vitest
- add analyze-core and analyze route tests for error paths and success flow
- **web**: add tests for analyze-core, analyze-route, auth, and auto-analyze uncovered lines
- **web**: add coverage tests for api-helpers, tags, categories, backy-history
- **web**: improve coverage for sidebar, score-cards, and gantt-chart

## [1.8.3] - 2026-04-14

### Web Dashboard

#### Fixed
- **Hardcoded colors replaced with design tokens**: `dark:bg-[#171717]` → `dark:bg-background`, `bg-black` overlays → `bg-zinc-950`, status indicators unified to `text-success`/`text-warning`/`text-destructive` tokens, score ring SVG strokes now use CSS variables
- **Dark mode hash-color adaptation**: `getHashColor()` now accepts `isDark` parameter — dark mode uses lower saturation + higher lightness foreground, dark background. New `useIsDark` hook (via `useSyncExternalStore`) wired into tag-badge, category-pill, and gantt-chart
- **DM Sans font loading**: Added Google Font import alongside Inter; `font-display` no longer silently falls back to system-ui
- **Non-standard font sizes eliminated**: New `text-micro` utility (10px); all `text-[9px]`/`text-[10px]`/`text-[11px]` replaced with `text-micro` or `text-xs`; icon sizes normalized to `size-5`
- **`transition-all` replaced with scoped transitions**: `transition-colors` (button), `transition-[stroke-dashoffset]` (score ring), `transition-[width]` (progress bar), `transition-[box-shadow,opacity]` (tag toggle)
- **Magic numbers extracted**: Sidebar widths to `--sidebar-width`/`--sidebar-collapsed` CSS variables; Gantt chart `LABEL_WIDTH`/`AXIS_HEIGHT` constants; `--radius-card` updated to 16px with `rounded-card` token
- **Keyboard navigation and ARIA**: Calendar popup closes on Escape; session rows have `aria-expanded`; category/tag dropdowns support ArrowUp/Down/Enter/Escape with `role="listbox"`/`role="option"`/`aria-selected`; ToggleSwitch labels properly associated via `id`/`htmlFor`
- **`<img>` → `next/image`**: Login page and sidebar logos replaced with Next.js Image component for optimization

## [1.8.2] - 2026-04-10

### Mac App

#### Fixed
- **Auto-start tracking on login item launch**: Fixed issue where tracking wouldn't automatically start when Gecko launched as a login item after system restart. Added primary auto-start logic in `GeckoApp.init()` since `MenuBarExtra` content closures are lazily evaluated and only execute when the user clicks the menu bar icon.

## [1.8.1] - 2026-04-06

### Web Dashboard

#### Added
- **Notifications section in General Settings**: Centralized location for Auto-summarize and Email notification toggles with Dove integration

#### Changed
- **Auto-summarize moved from AI Settings**: Now in General Settings → Notifications for better organization
- **AI Settings icon styling**: Added rounded background and increased icon size for better visibility

## [1.8.0] - 2026-04-06

### Web Dashboard

#### Changed
- **AI module extracted to npm package**: Migrated AI service implementation to `@nocoo/next-ai` package for reusability across projects
- **BDD tests relocated**: Moved Playwright BDD specs from `src/__tests__/bdd/` to `e2e/bdd/` to avoid conflicts with bun test runner

#### Fixed
- **Playwright testDir config**: Updated to match new BDD test location

## [1.7.1] - 2026-04-05

### Web Dashboard

#### Added
- **Per-page skeletons for sessions/apps**: Loading states now display content-shaped skeleton placeholders instead of generic spinners (B-4 compliance)

#### Fixed
- **`logo-192.png` generation**: `resize-logos.py` now produces 192×192 asset for 2× Retina login avatars (B-3 compliance)
- **osv-scanner false positive**: Ignored non-applicable Next.js PPR vulnerability (gecko uses vinext, not Next.js runtime)

## [1.7.0] - 2026-04-04

### Web Dashboard

#### Added
- **Smart context switch detection**: Only counts "deep" app switches where user stayed ≥5min in the new app. Dwell time accumulation respects a 5min gap threshold to avoid counting fragmented sessions across idle periods as continuous dwell
- **Dev workflow URL exclusion**: IDE ↔ localhost preview (localhost, 127.0.0.1, any port, hexly.ai domains) is recognized as normal workflow and excluded from switch counting. Social media and other non-dev URLs still count as real switches

#### Changed
- Switch rate scoring now better reflects actual attention fragmentation — quick previews during development don't penalize productivity scores

## [1.6.2] - 2026-04-04

### Web Dashboard

#### Fixed
- **Input/Select components use `bg-input`**: Per B-5 spec, interactive controls now use the L3 `--input` token instead of `bg-background`, providing proper visual affordance in dark mode
- **Dark mode `--input` brightness**: Corrected from 12% to 18% per B-5 spec, ensuring sufficient contrast against L2 cards (12.2%)
- **Breadcrumbs accessibility**: `aria-current="page"` now always set on the last item per B-2 spec (dove a11y best practice)

## [1.6.1] - 2026-03-31

### Web Dashboard

#### Added
- **Email notifications via Dove**: Daily analysis results are sent as formatted emails through the Dove relay service. Supports user-level opt-in (`notification.email.enabled`), per-user recipient address, and optional manual-analyze trigger. Idempotency keys prevent duplicate sends
- **Email formatters**: Highlights/improvements rendered as Markdown bullet lists, time segments as Markdown table rows, all wired into a Dove template (`daily-analysis`)

#### Fixed
- **Auto-analyze scheduler in production**: `ensureAutoAnalyze()` moved from `instrumentation.ts` (never loaded by vinext production builds) to the analyze route module scope, ensuring the hourly scheduler actually starts in production
- **Dove webhook payload**: Corrected field name (`template` not `template_slug`) and ensured all template variables are strings per Dove API spec

## [1.6.0] - 2026-03-31

### Web Dashboard

#### Added
- **Auto daily analyze**: Hourly background scheduler automatically triggers AI analysis of the previous day's sessions when new-day data arrives. Users with `ai.autoSummarize` enabled get yesterday analyzed without manual intervention
- **HourlyScheduler**: Generic hourly timer service (class + factory + lazy singleton) with re-entrancy guard, per-listener error isolation, and unsubscribe support
- **AutoAnalyzeService**: Business logic layer that finds eligible users, checks trigger conditions (today has sessions + yesterday unanalyzed), and fires analysis as background tasks with 1h stale-task cleanup
- **analyze-core service**: Extracted the full AI analysis pipeline (settings → data → prompt → AI call → cache) from the route handler into a reusable `runAnalysis()` function with discriminated union return type (`AnalysisOutcome`)
- **DB-level claim lock**: Atomic `INSERT ... ON CONFLICT DO NOTHING` with `__analyzing__` sentinel prevents duplicate AI spend across concurrent workers
- **Claim release on failure**: Failed analyses (provider timeout, parse error, etc.) automatically release the DB claim so the next hourly tick can retry

#### Changed
- Analyze route (`POST /api/daily/[date]/analyze`) refactored from 577-line monolith to thin HTTP wrapper delegating to `analyze-core`
- Auto-analyze scheduler wired via `instrumentation.ts` `register()` hook — starts on server boot, not on first route visit
- `settings-repo` gained `findUserIdsByKeyValue()` for discovering users by setting
- `daily-summary-repo` gained `claimForAnalysis()` and `releaseAnalysisClaim()` for atomic claim management

#### Infrastructure
- Enforced `noUncheckedIndexedAccess` in TypeScript config for stricter array access safety
- Standardized CI toolchain with unified pre-commit hook pipeline
- Migrated dev/E2E/BDD ports from 7028/17028/27028 to 7018/17018/27018
- Fixed `.env` base config loading in E2E scripts for D1 credentials
- Restored skipped daily-review BDD test (L3 coverage)

## [1.5.1] - 2026-03-10

### Mac App

#### Fixed
- **Auto-start tracking on login-item launch**: Tracking never started when the app launched as a login item (via "Launch at login"). The auto-start logic was attached to the main `Window` scene's `.task`, which is not evaluated for `LSUIElement` apps launched in the background. Added a duplicate `.task` on the `MenuBarExtra` scene, which is always initialized on app launch regardless of launch method

#### Changed
- **Standardized Apple Development signing**: Switched from ad-hoc signing to stable `Apple Development` identity with team `93WWLTN9XU`, preserving TCC permissions across rebuilds
- **Logo asset pipeline**: Standardized to single-source pattern for consistent icon rendering

## [1.5.0] - 2026-03-07

### Web Dashboard

#### Added
- **AI prompt preview card**: When clicking "Analyze", the full prompt sent to the AI is now displayed as a card that appears instantly and auto-collapses once the AI result arrives. Click to expand/collapse at any time
- **Prompt persistence**: The AI prompt is stored in `daily_summaries` (new `ai_prompt` column, migration 0008) so users can inspect what data was fed to the model even after the fact
- **Preview-prompt API**: New lightweight `POST /api/daily/[date]/preview-prompt` endpoint that builds and returns the prompt without calling the AI provider (sub-second response)
- **D1 retry mechanism**: `execute()` now retries up to 2 times on transient network errors (TLS socket closures from Cloudflare D1 REST API)

#### Changed
- Analyze API (`POST /api/daily/[date]/analyze`) now returns a `prompt` field in both fresh and cached responses
- `GET /api/daily/[date]` includes cached `prompt` when available
- `DailyReviewClient` fires preview-prompt and analyze requests in parallel for optimal UX

## [1.4.0] - 2026-03-07

### Web Dashboard

#### Added
- **Custom prompt templates**: Users can now edit the AI analysis prompt from Settings → AI. The prompt is split into 4 sections (Role & Context, Data Injection, Analysis Rules, Output Format), each independently customizable with per-section reset buttons
- **Template variable system**: Section 2 supports `{{mustache}}` syntax with 14 available variables (date, scores, topApps, timeline, etc.) and an "Insert Variable" dropdown with live examples
- **Prompt defaults module**: Extracted `@/services/prompt-defaults.ts` as a shared constants module safe for both server and client bundles

#### Changed
- `buildPrompt()` refactored from hardcoded string concatenation to 4-section template architecture with optional `CustomPromptSections` parameter (backwards compatible)
- AI settings API (`GET/PUT /api/settings/ai`) extended to read/write `ai.prompt.section{1-4}` keys
- Analyze route wired to load and apply custom prompt sections from user settings

## [1.3.0] - 2026-03-06

### Documentation

#### Changed
- **README.md**: Fixed database path (`ai.hexly.gecko`), updated test counts (608 web + 194 mac), four-layer testing architecture, added 10+ missing features (Daily Review, AI analysis, Backy backup, Public API, app notes, timezone settings, launch at login)
- **Database schema docs**: Added 7 missing cloud tables (categories, app_category_mappings, tags, app_tag_mappings, settings, daily_summaries, app_notes) and 5 missing migrations (v3–v7)
- **Data collection docs**: Major rewrite — added state machine architecture, adaptive GCD timer (3/6/12s), idle detection, screen lock/sleep observers, title debounce, Low Power Mode awareness, WindowContext single AX lookup
- **Data sync docs**: Added 18 missing API endpoints (daily review, AI settings, timezone, app notes, Backy ×6, public API, health check), updated test counts, fixed E2E ports
- **Daily review docs**: Noted `stats_json` column drop (migration 0007), corrected "today excluded" → "today allowed" (v1.1.2), added timezone-aware day boundaries
- **Testing plan docs**: Updated status table (all phases PASS), fixed ESLint mode (`strict` not `strictTypeChecked`), updated BDD test list, noted BDD is on-demand not pre-push

#### Added
- **Energy optimization docs**: Added "Status: COMPLETED (v1.0.1)" banners to all three phase documents (phases 1–3)

## [1.2.0] - 2026-03-06

### Mac Client

#### Added
- **Launch at login**: New toggle in Settings → General to start Gecko automatically at macOS login, backed by `SMAppService` (system-managed, no UserDefaults needed)

### Web Dashboard

#### Added
- **Integrations & API page**: Endpoint display, API key management (create, list, rename, revoke), and test panel
- **Public API**: `GET /api/v1/snapshot` with Bearer token authentication
- **E2E test suite**: 11 API E2E tests covering sync status, apps CRUD, timezone settings, stats/timeline, public API, and API key lifecycle
- **BDD E2E tests**: 21 Playwright browser tests for all core user flows
- **Four-layer testing infrastructure**: UT + Lint (pre-commit) + API E2E (pre-push) + BDD E2E (on-demand)

#### Changed
- Sidebar reorganized into Overview, Data, Integrations, Settings sections
- "Backup" renamed to "Backy" across sidebar, page title, and breadcrumb
- ESLint upgraded to strict preset with zero-tolerance warnings
- SwiftLint upgraded to `--strict` mode for zero-tolerance warnings
- E2E port convention standardized: 17018 (L3 API), 27018 (L4 BDD)

#### Fixed
- Port handling and clean shutdown for dev/E2E servers
- E2E test payloads aligned with current sync API contract and Backy masking
- Pre-push hook correctly sets `E2E_FAILED` variable for proper server cleanup

## [1.1.3] - 2026-03-02

### Web Dashboard

#### Added
- **Backy backup integration**: Full push/pull backup system for automated data backup to a Backy service
  - Push backup: configure webhook URL + API key, test connection, execute manual push
  - Pull webhook: generate a webhook key so Backy can trigger scheduled backups via `POST /api/backy/pull`
  - Full data export: all 10 database tables (focus sessions, categories, tags, settings, etc.) exported as gzip-compressed JSON envelope
  - Paginated focus session export (5,000 rows per page) for large datasets
  - Backup history viewer via Backy service API
  - Backy credentials excluded from backup envelope for security
  - Backup tag format: `v{version}-{date}-{N}sess-{N}cat-{N}tag`
- **Backup settings page** (`/settings/backy`): Two-card layout for push configuration and pull webhook management with one-time key reveal dialog
- **Sidebar navigation**: Added "Backup" entry under Settings group
- **Product roadmap**: Internal roadmap document with 20 features from brainstorming session

#### Fixed
- Coverage threshold enforcement added to pre-commit hook
- Unused parameter lint warning in daily analyze route

### Mac Client

No changes in this release.

## [1.1.2] - 2026-03-01

### Web Dashboard

#### Added
- **Timezone-aware day boundaries**: All daily stats, timeline, and AI analysis now use the user's configured IANA timezone (default `Asia/Shanghai`) instead of UTC or server-local time
- **Timezone settings**: GET/PUT `/api/settings/timezone` endpoint with timezone selector and auto-detect on the Settings page
- **Cross-midnight session support**: Sessions spanning midnight (e.g., loginwindow 21:24→05:26) now appear on both days, clipped to each day's boundaries
- **Today's daily review**: `/daily` now defaults to today instead of yesterday; partial data is shown as it's collected
- **Apps page**: Redesigned with card layout, inline tag creation, expanded category icon options (22 icons), and app notes with AI prompt enrichment
- **App notes**: New `app_notes` table; user annotations are included in AI analysis prompts for better context

#### Fixed
- DST-safe day bounds: `getDateBoundsEpoch` uses next-day midnight instead of `+ 86400` (wrong on 23h/25h DST days)
- `localDateToUTCEpoch` uses two-pass approach for midnight-accurate offset on DST transition days
- `sqlDateExpr` accepts reference date instead of using current time (prevents drift across DST boundaries)
- Gantt chart reuses `timezone.ts` for midnight calculation; bars clamped to visible range; full 00:00–24:00 axis
- Date picker uses UTC noon to prevent browser-local timezone drift
- AI analysis: structured logging, 55s timeout (under Railway's 60s limit), HTTPS redirect in production
- Dropped unused `stats_json` column from `daily_summaries` (stats always computed fresh)

### Mac Client

#### Fixed
- Resume suspended GCD dispatch source before cancel to prevent EXC_BAD_INSTRUCTION crash on sleep-while-locked
- Eliminate force unwraps and `fatalError`; add structured logging across all services
- Replace force cast with `unsafeBitCast` for AXUIElement to satisfy SwiftLint

## [1.1.1] - 2026-02-28

### Mac Client

#### Changed
- Replaced menu bar icon from SF Symbol (`eye.circle`) to custom gecko logo (template image, auto-adapts to light/dark mode)

### Web Dashboard

No changes in this release.

## [1.1.0] - 2026-02-28

### Web Dashboard

#### Added
- **Daily Review page** (`/daily/:date`): Full-page daily productivity analysis with left-right split layout
  - Score cards with SVG ring visualizations (focus, deep work, switch rate, concentration, overall)
  - Gantt chart horizontal timeline showing app usage throughout the day
  - Date navigation with arrow buttons and calendar popup (react-day-picker)
- **AI-powered daily analysis**: POST `/api/daily/:date/analyze` generates structured insights via LLM
  - Highlights, improvements, time segment breakdown (3-6 per day), and Markdown summary
  - Session timeline with browser URLs/titles, idle detection (loginwindow/ScreenSaver), and content analysis
  - Configurable AI provider (OpenAI, Anthropic, custom) with model selection and test connection
  - Results cached in D1; regenerate button with `?force=true` cache bypass
  - Model details card showing provider, model, duration, and token usage
- **AI Settings page**: Configure AI provider, API key, model, and base URL with test connection
- **Daily stats service**: `computeScores()` and `computeDailyStats()` with 26 unit tests
- **Daily summary repository**: D1-backed cache for stats and AI results
- DMG packaging script for Mac client distribution

### Mac Client

No changes in this release.

## [1.0.1] - 2026-02-28

### Mac Client

#### Added
- State machine architecture: `TrackingState` enum (`.stopped`, `.active`, `.idle`, `.locked`, `.asleep`) replaces ad-hoc boolean flags with explicit transitions and co-located side effects
- Title change debounce: 2-second delay for title-only changes to reduce DB write churn by 30-50%, while app/URL changes remain instant
- Network awareness: `NWPathMonitor` gates SyncService to skip futile HTTP requests when offline
- Adaptive polling timer: 3s (active) → 6s (stable >30s) → 12s (deep focus >5min), with 1.5x multiplier in Low Power Mode
- Battery awareness via `NSProcessInfoPowerStateDidChange` observer
- AX window context cache: single Accessibility API lookup replaces 4 separate calls per tick
- Permission manager exponential backoff (2s → 5s → 10s → 30s)
- Idle detection (>60s via `CGEventSource`) pauses polling entirely
- Screen lock/unlock observers via `DistributedNotificationCenter`
- System sleep/wake observers via `NSWorkspace`
- Timer tolerance on all repeating timers for macOS wake-up coalescing
- Native macOS Settings window with Cmd+, shortcut

#### Changed
- DB write priority lowered from `.userInitiated` to `.utility` for background persistence
- Non-browser apps skip AppleScript URL fetch entirely
- Moved SyncService DB fetch off MainActor to background thread
- API key stored in macOS Keychain instead of UserDefaults
- Sync server URL validation requires HTTPS
- Permission polling stops when all permissions are granted

#### Fixed
- Accessibility labels added to color-only status indicators and MenuBar/Settings buttons
- URLs in session list now clickable via `Link` instead of plain `Text`
- Session list only auto-scrolls on explicit refresh
- Database path TextField made read-only to enforce Browse button usage

### Web Dashboard

No changes in this release.

## [1.0.0] - 2026-02-28

### Mac Client

#### Added
- Focus tracking engine with event-driven architecture (NSWorkspace notifications + 3s fallback timer)
- Rich context capture: window title, bundle ID, browser URL, tab title, tab count, document path, fullscreen/minimized state
- Browser URL extraction via AppleScript for Safari, Chrome, Arc, Edge, Brave, Firefox, Opera, Vivaldi
- SQLite database (GRDB) for persistent session storage
- Settings page: custom database path, cloud sync configuration, auto-start tracking on launch
- About page with version info and app description
- Menu bar integration with quick tracking toggle
- Permission management with Accessibility and Automation status, reset & request flows
- Cloud sync service with async queue, configurable server URL and API key
- 188+ unit tests covering all services and view models

#### Changed
- Bundle ID changed from `com.gecko.app` to `ai.hexly.gecko`
- Stable code signing identity for persistent TCC permissions across rebuilds

### Web Dashboard

#### Added
- Dashboard with screen time analytics and session visualization (Recharts)
- Google OAuth authentication via NextAuth v5 (JWT mode)
- Sync API: `/api/sync` endpoint with in-memory queue and background drain worker
- Categories & Tags system with CRUD APIs, icon picker, and app-to-category/tag mapping UI
- Settings pages: General, Categories, Tags with sidebar navigation
- Liveness probe endpoint (`/api/live`)
- Built with vinext (Vite + React 19 RSC), Tailwind CSS v4, shadcn/ui, Cloudflare D1
- Dockerized for Railway deployment
- ESLint + comprehensive E2E test suite (BDD)
