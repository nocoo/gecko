<p align="center">
  <img src="apps/web-dashboard/public/logo-80.png" alt="Gecko" width="80" height="80" />
</p>

<h1 align="center">Gecko</h1>

<p align="center">
  <strong>🦎 Personal macOS screen time &amp; focus tracking with cloud-synced web dashboard</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-14.0%2B-2d8553?logo=apple&logoColor=white" alt="macOS 14.0+" />
  <img src="https://img.shields.io/badge/Swift-5.10-F05138?logo=swift&logoColor=white" alt="Swift" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Bun-runtime-FBF0DF?logo=bun&logoColor=black" alt="Bun" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

---

Gecko is a lightweight menu bar app that silently tracks which application and window you're focused on, recording sessions to a local SQLite database. A companion web dashboard provides screen time analytics with cloud sync via Cloudflare D1. Built for personal use — no telemetry, no App Store sandbox.

## ✨ Features

### 🖥️ Mac Client

- **Event-driven focus tracking** — listens for app activations via `NSWorkspace` notifications, with an adaptive fallback timer for in-app changes (3s → 6s → 12s based on context stability)
- **State machine architecture** — formal `TrackingState` enum (`.stopped`, `.active`, `.idle`, `.locked`, `.asleep`) with explicit transitions and co-located side effects
- **Energy efficient** — 80-95% power reduction: idle detection (>60s), screen lock/sleep suspension, Low Power Mode awareness (1.5× interval), title change debounce (2s), and timer leeway for macOS wake-up coalescing
- **Browser URL extraction** — grabs the current URL from Chrome, Safari, Edge, Brave, Arc, and Vivaldi via AppleScript (skipped entirely for non-browser apps)
- **Local SQLite storage** — all data stays on your machine at `~/Library/Application Support/ai.hexly.gecko/gecko.sqlite`
- **Cloud sync** — background sync to Cloudflare D1 with network awareness (skips when offline), batched uploads, and watermark-based pagination
- **Menu bar only** — runs as `LSUIElement` (no Dock icon), always accessible from the menu bar
- **Permission onboarding** — guides you through granting Accessibility and Automation permissions, with exponential backoff polling
- **Secure** — API key stored in macOS Keychain, sync requires HTTPS
- **Launch at login** — optional auto-start via `SMAppService`

### 🌐 Web Dashboard

- **Screen time analytics** — daily usage breakdown with interactive charts (Recharts), timeline view, and top apps table
- **Daily Review** — per-day deep dive with score cards, Gantt-style session timeline, and AI-powered analysis (Anthropic / OpenAI)
- **Cloud sync** — automatic background sync from local SQLite to Cloudflare D1, with batched writes respecting D1's 100-param limit
- **App Categories** — organize apps into categories (4 built-in defaults + custom). Each category has an icon and a stable hash-derived color
- **Tags** — flexible tagging system with multi-tag support per app
- **App Notes** — annotate apps with context for AI analysis
- **Public API** — `/api/v1/snapshot` endpoint for external integrations (Bearer token auth)
- **API key management** — create, rename, and revoke API keys for device sync and public API access
- **Backy backup** — push/pull cloud data to an external Backy backup service
- **Timezone settings** — configurable IANA timezone for accurate day boundaries
- **Google OAuth** — secure authentication via NextAuth v5 (email allowlist)
- **Dark mode** — system-aware theme switching
- **Responsive sidebar** — collapsible navigation with smooth CSS grid animations

### 🛠️ Developer Experience

- **Monorepo** — clean separation between macOS client and web dashboard
- **6DQ quality gates** — L1 unit/coverage, L2 API E2E (real HTTP), L3 Playwright BDD; G1 typecheck+Biome/SwiftLint; G2 security; D1 isolated test DB
- **Husky git hooks** — pre-commit: G1 + L1; pre-push: L2 ‖ G2; L3 BDD on-demand / CI
- **Atomic commits** — Conventional Commits format, one logical change per commit

## 📋 Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| macOS | 14.0+ (Sonoma) | Operating system |
| Xcode | 16.0+ | Mac client build |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) | latest | Xcode project generation |
| [SwiftLint](https://github.com/realm/SwiftLint) | latest | Swift linting |
| [Bun](https://bun.sh) | latest | Web dashboard runtime & package manager |

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/nocoo/gecko.git
cd gecko

# Install dependencies & git hooks
bun install

# ── Mac Client ──
cd apps/mac-client
xcodegen generate
open Gecko.xcodeproj    # Build & run from Xcode

# ── Web Dashboard ──
cd apps/web-dashboard
bun install
bun run dev             # http://localhost:7018
```

## 📁 Project Structure

```
gecko/
├── 🦎 logo.png                          # App logo (2048×2048)
├── apps/
│   ├── mac-client/                       # macOS SwiftUI menu bar app
│   │   ├── project.yml                   #   xcodegen config
│   │   ├── Gecko/Sources/                #   App, Models, Services, Views
│   │   └── GeckoTests/                   #   194 unit + integration tests
│   └── web-dashboard/                    # Web dashboard (vinext + React 19)
│       ├── drizzle/                      #   D1 migration SQL files
│       ├── src/
│       │   ├── app/                      #   Pages & API routes
│       │   ├── components/               #   UI components (shadcn/ui + custom)
│       │   └── lib/                      #   Utilities, sync queue, D1 client
│       └── src/__tests__/                #   608 unit + 11 E2E + 6 BDD tests
├── docs/                                 # Architecture documentation
├── packages/                             # Shared config
└── scripts/                              # Git hooks & tooling
```

## 🧪 Testing (6DQ)

| Dim | Command | Notes |
|-----|---------|-------|
| **G1** | `bun run typecheck` · `bun run lint` · mac `swiftlint --strict` | Static analysis |
| **L1** | `bun run test:l1` (web coverage) · mac `xcodebuild test` | Unit / component |
| **L2** | `bun run test:l2` (= web `test:e2e`, port **17018**) | Real HTTP + local SQLite |
| **L3** | `bun run test:l3` (= web `test:bdd`, port **27018**) | Playwright browser |
| **G2** | `cd apps/web-dashboard && bun run gate:security` | osv-scanner + gitleaks |

```bash
# G1 + L1 (also what pre-commit runs for web)
bun run typecheck && bun run lint && bun run test:l1

# Mac client — L1 + G1
xcodebuild test -project apps/mac-client/Gecko.xcodeproj \
  -scheme Gecko -destination 'platform=macOS' -quiet
cd apps/mac-client && swiftlint lint --strict

# L2 API E2E — stop other vinext dev (e.g. :7018) first
bun run test:l2

# L3 Playwright BDD (CI / on-demand)
bun run test:l3
```

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Mac Client | Swift 5.10, SwiftUI, GRDB, `NSWorkspace` |
| Web Framework | [vinext](https://github.com/anthropics/vinext) (Vite 7 + React 19 RSC) |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI |
| Auth | NextAuth v5 (Google OAuth) |
| Cloud DB | Cloudflare D1 (SQLite-compatible) |
| Local DB | SQLite via GRDB (mac) |
| Charts | Recharts |
| Testing | Vitest, Bun test (L2), Playwright (L3), XCTest, SwiftLint, Biome |
| CI/Hooks | Husky pre-commit (G1+L1) · pre-push (L2‖G2) · base-ci |

## 📄 License

[MIT](LICENSE) © 2026 Zheng Li
