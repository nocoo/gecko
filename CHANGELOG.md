# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
