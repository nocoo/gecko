# Data Collection

## Overview

The macOS client collects focus session data by monitoring which application and window the user is actively interacting with. Each time the user switches to a different app or a different context within the same app (e.g. browser tab, editor file), the current session is finalized and a new one begins.

**Source files:**

| File | Role |
|---|---|
| `TrackingEngine.swift` | Core engine: event observation, AX reads, session lifecycle |
| `BrowserURLFetcher.swift` | Browser detection, AppleScript execution, URL/tab parsing |
| `FocusSession.swift` | Data model (13 fields), GRDB persistence |
| `DatabaseManager.swift` | SQLite read/write via GRDB `DatabaseQueue` |
| `PermissionManager.swift` | Accessibility + Automation permission management |
| `TrackingViewModel.swift` | Thin binding layer between engine and SwiftUI views |

---

## Detection Strategy

`TrackingEngine` uses a dual-strategy approach for maximum coverage:

### 1. Event-driven: NSWorkspace notification

Subscribes to `NSWorkspace.didActivateApplicationNotification` to detect **app-level switches** (e.g. Chrome -> Cursor). This fires instantly when the user Command-Tabs or clicks a different app.

```
NSWorkspace.didActivateApplicationNotification
    -> handleAppActivation()
        -> extract NSRunningApplication from notification.userInfo
        -> read all context (window title, URL, document path, etc.)
        -> switchFocus() -> finalize old session, start new session
```

### 2. Fallback timer: 3-second polling

A repeating timer at 3-second intervals detects **in-app context changes** that don't fire workspace notifications:

- Browser tab switches (URL changes without app switch)
- Editor file switches (window title changes without app switch)
- Any navigation that changes the focused window's title

```
Timer (3.0s interval)
    -> checkForInAppChanges()
        -> read current window title + URL
        -> compare with lastWindowTitle / lastURL
        -> if changed: switchFocus()
```

The timer is a **change detector**, not a blind recorder. It only creates a new session when `titleChanged || urlChanged`.

### 3. Startup capture

On `start()`, the engine immediately captures the current focus state without waiting for the first notification or timer tick.

---

## Data Sources

Each focus session captures 13 fields from four distinct data sources:

### Source A: NSRunningApplication (from notification or `frontmostApplication`)

| Field | API | Notes |
|---|---|---|
| `appName` | `.localizedName` | Display name, e.g. "Google Chrome" |
| `bundleId` | `.bundleIdentifier` | e.g. "com.google.Chrome", nullable |

### Source B: Accessibility API (AXUIElement)

All AX reads go through a shared helper that creates an `AXUIElement` from the app's PID via `AXUIElementCreateApplication(pid)`, then reads `kAXFocusedWindowAttribute` to get the focused window.

| Field | AX Attribute | Notes |
|---|---|---|
| `windowTitle` | `kAXTitleAttribute` | Read from focused window element |
| `documentPath` | `kAXDocumentAttribute` | Returns `file://` URL, converted to path. Supported by TextEdit, Xcode, Preview. Nil for most apps |
| `isFullScreen` | `"AXFullScreen"` (string literal) | Boolean, defaults to `false` |
| `isMinimized` | `kAXMinimizedAttribute` | Boolean, defaults to `false` |

**Required permission:** Accessibility (prompted via `AXIsProcessTrustedWithOptions`).

### Source C: AppleScript (browser-specific)

For recognized browsers, an AppleScript extracts URL, tab title, and tab count from the frontmost window. Executed on a background thread via `DispatchQueue.global(qos: .userInitiated)` with typical latency of 50-200ms.

| Field | AppleScript Property | Notes |
|---|---|---|
| `url` | `URL of active tab` | Chromium; `URL of current tab` for Safari |
| `tabTitle` | `title of active tab` | Chromium; `name of current tab` for Safari |
| `tabCount` | `count of tabs` | Front window tab count |

**Supported browsers:**

| Browser | App Name | Script Target | Engine |
|---|---|---|---|
| Chrome | "Google Chrome" | "Google Chrome" | Chromium |
| Safari | "Safari" | "Safari" | WebKit |
| Edge | "Microsoft Edge" | "Microsoft Edge" | Chromium |
| Brave | "Brave Browser" | "Brave Browser" | Chromium |
| Arc | "Arc" | "Arc" | Chromium |
| Vivaldi | "Vivaldi" | "Vivaldi" | Chromium |

**AppleScript template (Chromium):**

```applescript
tell application "<scriptTarget>"
    if (count of windows) > 0 then
        set frontWin to front window
        set tabURL to URL of active tab of frontWin
        set tabName to title of active tab of frontWin
        set tabNum to count of tabs of frontWin
        return tabURL & "\t" & tabName & "\t" & (tabNum as text)
    end if
end tell
```

Safari differs: uses `current tab` instead of `active tab`, and `name` instead of `title`.

**Output format:** Tab-delimited `"url\ttabTitle\ttabCount"`, parsed by `parseBrowserInfo(from:)` which handles partial output and missing fields gracefully.

**Required permission:** Automation (Apple Events). Checked via a heuristic AppleScript to System Events since no direct API exists.

### Source D: Runtime-generated

| Field | Source | Notes |
|---|---|---|
| `id` | `UUID().uuidString` | Generated on session creation |
| `startTime` | `Date().timeIntervalSince1970` | Unix timestamp (seconds) |
| `endTime` | `Date().timeIntervalSince1970` | Set when session is finalized |
| `duration` | `endTime - startTime` | Computed on finalization |

---

## Session Lifecycle

```
[User switches context]
         |
         v
    switchFocus(newContext)
         |
         ├── 1. Finalize current session
         │       session.finish()          -> set endTime, compute duration
         │       db.update(session)        -> persist to local SQLite
         │
         ├── 2. Create new session
         │       FocusSession.start(...)   -> startTime = endTime = now, duration = 0
         │       db.insert(session)        -> persist to local SQLite
         │
         └── 3. Update state
                 currentSession = newSession
                 lastWindowTitle = newTitle
                 lastURL = newURL
                 loadRecentSessions()      -> refresh UI via fetchRecent(limit: 50)
```

**Active session indicator:** A session is active when `duration == 0 && endTime == startTime`. It has been created but not yet finalized.

**Finalization trigger:** The current session is finalized when `switchFocus()` is called — either by the workspace notification (app switch) or the fallback timer (in-app context change).

---

## Permissions

Two macOS permissions are required, both checked by `PermissionManager` with a 2-second polling timer:

| Permission | Purpose | Check API | Prompt API |
|---|---|---|---|
| Accessibility | Read window titles, document paths, fullscreen/minimized state | `AXIsProcessTrusted()` | `AXIsProcessTrustedWithOptions` |
| Automation | Execute AppleScript to read browser URLs | Heuristic (test script to System Events) | Triggered on first AppleScript execution |

**App configuration:**

- `LSUIElement: true` — Agent app (no Dock icon, menu bar only)
- `com.apple.security.app-sandbox: false` — Required for AX and Apple Events
- Stable code signing identity (Apple Development certificate) — Required for TCC permission persistence across rebuilds

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        macOS System                         │
│                                                             │
│  NSWorkspace ──notification──> TrackingEngine               │
│                                     │                       │
│  Timer (3s) ──poll──────────> checkForInAppChanges()        │
│                                     │                       │
│                              ┌──────┴──────┐                │
│                              │ switchFocus()│                │
│                              └──────┬──────┘                │
│                                     │                       │
│                    ┌────────────────┼────────────────┐      │
│                    │                │                │      │
│              AXUIElement     NSRunningApp      AppleScript  │
│              (Accessibility)  (System)         (Automation) │
│                    │                │                │      │
│                    ▼                ▼                ▼      │
│              windowTitle       appName            url       │
│              documentPath      bundleId          tabTitle   │
│              isFullScreen                        tabCount   │
│              isMinimized                                    │
│                    │                │                │      │
│                    └────────────────┼────────────────┘      │
│                                     │                       │
│                              FocusSession                   │
│                              (13 fields)                    │
│                                     │                       │
│                              DatabaseManager                │
│                              (GRDB/SQLite)                  │
│                                     │                       │
│                              gecko.sqlite                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
