# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
