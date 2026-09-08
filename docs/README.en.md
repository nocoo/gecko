<p align="center">
  <img src="../assets/brand/icon-rounded.png" alt="Gecko" width="128" height="128" />
</p>

<h1 align="center">Gecko</h1>

<p align="center">Record app and window usage on a Mac and review your day locally or in a web dashboard.</p>

<p align="center">
  <a href="https://gecko.hexly.ai">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Gecko combines a macOS menu bar app with a web dashboard. The Mac app records foreground applications, window titles, and page information from supported browsers as local sessions. With sync enabled, the web app groups usage time, app breakdowns, and activity timelines by day.

It is intended for personal time reviews and observing focus habits. Statistics come from recorded sessions. AI analysis is optional and requires your own model service; its output interprets recorded activity and does not provide a complete measure of work produced.

## Features

- Track foreground app and window changes, with idle, lock, and sleep detection; update sessions through event notifications and adaptive timer checks.
- Read the active tab's URL, title, and tab count from Chrome, Safari, Edge, Brave, Arc, and Vivaldi, subject to macOS Automation permissions.
- Save sessions in local SQLite; pause tracking, choose a database location, and launch at login.
- Batch-sync sessions to a web service over HTTPS with a device API key, retaining local records while offline.
- Review daily statistics, top apps, and session timelines; maintain app categories, tags, notes, and timezone settings.
- Generate daily analysis with a configured Anthropic / OpenAI-compatible model, customize prompts, and enable automatic reviews; send analysis emails when Dove is configured.
- Manage sync API keys, retrieve daily statistics and cached analysis through `/api/v1/snapshot?date=YYYY-MM-DD`, and push or restore Backy backups.

Without sync, records remain in the Mac database. Enabling sync uploads session fields to the configured service; requesting AI analysis sends session information and app context to the selected model service. Available window titles and URLs depend on application interfaces and system permissions.

## Usage

### Mac app

Requires macOS 14+. The latest GitHub Release currently contains source only; build and run the Mac app using the development steps below.

On first launch, follow the app's prompts to grant Accessibility and Automation permissions, then start tracking. The app stays in the menu bar, where you can open sessions or settings. Its default database is:

```text
~/Library/Application Support/ai.hexly.gecko/gecko.sqlite
```

### Web and sync

Open the [website](https://gecko.hexly.ai) or your own deployment and sign in with Google. Create a device API key on the API integration page, enter the key and deployment URL in the Mac app's sync settings, and enable sync. The key is stored in macOS Keychain.

The Mac app currently defaults to the development URL `https://gecko.dev.hexly.ai`. Change it to `https://gecko.hexly.ai` for the public deployment, or to your own HTTPS URL when self-hosting. Sync requires a reachable service and a valid key.

The web app uses `ALLOWED_EMAILS` to control which accounts may sign in. Set your own allowlist when deploying; in the current implementation, an empty list permits any account that completes Google OAuth. Categories, tags, AI settings, and backup settings are managed in the web dashboard.

## Development

### Prepare the repository

The web app requires Node.js 22.12+ and Bun. The Mac app requires Xcode 16+, XcodeGen, and macOS 14+.

```bash
git clone https://github.com/nocoo/gecko.git
cd gecko
bun install --frozen-lockfile
```

### Mac

`apps/mac-client/project.yml` contains the maintainer's signing team. Replace it with your own Apple Development team before generating the project:

```bash
cd apps/mac-client
xcodegen generate
open Gecko.xcodeproj
cd ../..
```

Select the Gecko scheme in Xcode to build and run. A stable development signature helps retain macOS permission grants. To package a DMG, install `create-dmg` and run `bash scripts/build-dmg.sh` from the root; the script recreates the root `build/` directory.

### Web

From the repository root, enter the web app and install dependencies:

```bash
cd apps/web-dashboard
bun install --frozen-lockfile
cp .env.example .env.local
```

Fill in Google OAuth's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, the session secret `NEXTAUTH_SECRET`, the actual `NEXTAUTH_URL`, and `ALLOWED_EMAILS` in `.env.local`. Local HTTP development can use `NEXTAUTH_URL=http://localhost:7018`, with the Google OAuth callback at `/api/auth/callback/google`.

There are two database modes. Set `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and `CF_D1_DATABASE_ID` for your own Cloudflare D1 database and apply the [drizzle migrations](../apps/web-dashboard/drizzle/) in order, or set `D1_LOCAL_PATH` to an initialized local SQLite file. These commands create a local development database and select it when starting the app:

```bash
bun run db:init .local/gecko-dev.db
D1_LOCAL_PATH=.local/gecko-dev.db bun run dev
```

Open `http://localhost:7018`. `db:init` deletes and recreates the selected database; run it only to initialize or reset that local database. AI, Dove, and Backy are optional and are not prerequisites for the basic pages.

From `apps/web-dashboard/`, use `bun run build` to build and `bun run start` to start the production server. The production runtime is Node.js; the [Dockerfile](../apps/web-dashboard/Dockerfile) uses Bun for installation/build and Node to run the app. Root `bun run typecheck` and `bun run lint` check web types and code style.

```text
apps/mac-client/       SwiftUI app, tracking and sync services, XCTest
apps/web-dashboard/    React / vinext pages, APIs, and local/remote database access
apps/web-dashboard/drizzle/  Cloud database migrations
scripts/               Mac builds and development tools
docs/                  Design records and this English README
```

## Tests

Run from the repository root:

| Layer | Command |
| --- | --- |
| Web unit and component tests | `bun run --cwd apps/web-dashboard test` |
| Web HTTP integration tests | `bun run --cwd apps/web-dashboard test:e2e` |
| Web browser tests | `bun run --cwd apps/web-dashboard test:bdd` |
| Mac unit and integration tests | `xcodebuild test -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -destination 'platform=macOS' -only-testing:GeckoTests` |

Before the first browser run, execute `bunx playwright install chromium` in `apps/web-dashboard/`. HTTP and browser tests use ports `17018` and `27018`, respectively, and recreate `.local/gecko-test.db`. Stop other vinext development servers first and run these suites sequentially. Ordinary tests do not need a cloud database. Real AI integration scenarios require credentials as described in `.env.e2e.example` and are skipped when they are absent.

Mac tests require full Xcode and the generated project. Environments running tests without signing can append `CODE_SIGNING_ALLOWED=NO CODE_SIGN_IDENTITY=""`. The web app's `test:coverage` generates a coverage report, and `test:watch` enables watch mode.

## Stack

![Swift](https://img.shields.io/badge/Swift-F05138?logo=swift&logoColor=white)
![SwiftUI](https://img.shields.io/badge/SwiftUI-007AFF)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F38020?logo=cloudflare&logoColor=white)

| Area | Implementation |
| --- | --- |
| Mac app | Swift, SwiftUI, AppKit / NSWorkspace, AppleScript, GRDB |
| Web | TypeScript, React, vinext / Vite, Tailwind CSS, Radix UI, Recharts |
| Data and identity | Local SQLite, Cloudflare D1 REST API, NextAuth / Google OAuth |
| AI | AI SDK, `@nocoo/next-ai`, Anthropic / OpenAI-compatible APIs |
| Tests | XCTest, Vitest, Bun HTTP tests, Playwright |

See the [Mac project configuration](../apps/mac-client/project.yml) and [web package.json](../apps/web-dashboard/package.json) for dependencies.

## Documentation

- [Database schema](01-database-schema.md)
- [Data collection](02-data-collection.md)
- [Sync design](03-data-sync.md)
- [Tracking engine architecture](06-energy-phase3-architecture.md)
- [Daily review](07-daily-review.md)
- [AI integration](10-next-ai-package.md)
- [Changelog](../CHANGELOG.md)

Design documents retain historical plans; this README and the source describe current runtime behavior and feature boundaries.

## License

[MIT](../LICENSE) © 2026 Zheng Li
