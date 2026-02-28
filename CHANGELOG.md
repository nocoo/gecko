# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
