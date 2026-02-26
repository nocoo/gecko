<p align="center">
  <img src="logo.png" alt="Gecko" width="128" height="128" />
</p>

<h1 align="center">Gecko</h1>

<p align="center">
  A personal macOS screen time &amp; focus tracking app.
</p>

---

Gecko is a menu bar app that silently tracks which application and window you're focused on, recording sessions to a local SQLite database. Built for personal use — no telemetry, no cloud, no App Store sandbox.

## Features

- **Event-driven focus tracking** — listens for app activations via `NSWorkspace` notifications, with a low-frequency fallback timer for in-app changes (e.g., browser tab switches)
- **Browser URL extraction** — grabs the current URL from Chrome, Safari, Edge, Brave, Arc, and Vivaldi via AppleScript
- **Local SQLite storage** — all data stays on your machine at `~/Library/Application Support/com.gecko.app/gecko.sqlite`
- **Menu bar only** — runs as `LSUIElement` (no Dock icon), always accessible from the menu bar
- **Permission onboarding** — guides you through granting Accessibility and Automation permissions

## Requirements

- macOS 14.0 (Sonoma) or later
- Xcode 16.0+
- [xcodegen](https://github.com/yonaskolb/XcodeGen)
- [SwiftLint](https://github.com/realm/SwiftLint)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/nocoo/gecko.git
cd gecko

# Install git hooks (pre-commit: UT, pre-push: UT + Lint)
./scripts/install-hooks.sh

# Generate Xcode project
cd apps/mac-client
xcodegen generate

# Open in Xcode and run
open Gecko.xcodeproj
```

## Project Structure

```
gecko/
├── logo.png                          # App logo (2048x2048)
├── apps/
│   ├── mac-client/                   # macOS SwiftUI app
│   │   ├── project.yml               # xcodegen config
│   │   ├── Gecko/
│   │   │   ├── Resources/
│   │   │   │   ├── Assets.xcassets/   # App icon & logo image assets
│   │   │   │   ├── Info.plist
│   │   │   │   └── Gecko.entitlements
│   │   │   └── Sources/
│   │   │       ├── App/               # GeckoApp entry point
│   │   │       ├── Models/            # FocusSession (GRDB Record)
│   │   │       ├── Services/          # DatabaseManager, TrackingEngine, etc.
│   │   │       └── Views/             # SwiftUI views
│   │   └── GeckoTests/               # Unit + integration tests
│   └── web-dashboard/                # Future web dashboard
├── packages/                         # Shared config (future)
└── scripts/                          # Git hooks & tooling
```

## Testing

```bash
# Run unit tests
xcodebuild test -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -destination 'platform=macOS' -quiet

# Run SwiftLint
cd apps/mac-client && swiftlint lint --strict
```

## License

Personal use only.
