# Data Collection

## Overview

The macOS client collects focus session data by monitoring which application and window the user is actively interacting with. Each time the user switches to a different app or a different context within the same app (e.g. browser tab, editor file), the current session is finalized and a new one begins.

**Source files:**

| File | Role |
|---|---|
| `TrackingEngine.swift` | Core state machine: event observation, AX reads, session lifecycle |
| `TrackingEngine+Observers.swift` | System event observers (lock, sleep, wake, power state) |
| `TrackingEngine+WindowContext.swift` | Accessibility API window context reading |
| `BrowserURLFetcher.swift` | Browser detection, AppleScript execution, URL/tab parsing |
| `FocusSession.swift` | Data model (13 fields), GRDB persistence |
| `DatabaseManager.swift` | SQLite read/write via GRDB `DatabaseQueue` |
| `PermissionManager.swift` | Accessibility + Automation permission management |
| `TrackingViewModel.swift` | Tracking status and permissions binding for SwiftUI |
| `SessionListViewModel.swift` | Recent sessions list via Combine subscription |

---

## State Machine Architecture

`TrackingEngine` uses a formal `TrackingState` enum replacing ad-hoc boolean flags. All state transitions go through `transition(to:)`, which co-locates side effects (timer start/stop, session finalization).

```
TrackingState:
    .stopped  ──start()──>  .active
    .active   ──idle >60s──>  .idle
    .idle     ──input detected──>  .active
    .active   ──screen lock──>  .locked
    .locked   ──unlock──>  .active
    .active/.locked  ──sleep──>  .asleep
    .asleep   ──wake──>  .active
    any state ──stop()──>  .stopped
```

| State | Timer | Polling | Session |
|---|---|---|---|
| `.stopped` | cancelled | none | finalized |
| `.active` | running | adaptive 3s/6s/12s | active |
| `.idle` | running | skips expensive work | finalized |
| `.locked` | suspended | none | finalized |
| `.asleep` | cancelled | none | finalized |

---

## Detection Strategy

`TrackingEngine` uses a dual-strategy approach for maximum coverage:

### 1. Event-driven: NSWorkspace notification

Subscribes to `NSWorkspace.didActivateApplicationNotification` to detect **app-level switches** (e.g. Chrome -> Cursor). This fires instantly when the user Command-Tabs or clicks a different app.

```
NSWorkspace.didActivateApplicationNotification
    -> handleAppActivation()
        -> extract NSRunningApplication from notification.userInfo
        -> readWindowContext(for: pid) -> WindowContext struct
        -> fetch browser URL if applicable (AppleScript)
        -> switchFocus() -> finalize old session, start new session
```

### 2. Adaptive fallback timer: GCD `DispatchSourceTimer`

A GCD timer detects **in-app context changes** that don't fire workspace notifications:

- Browser tab switches (URL changes without app switch)
- Editor file switches (window title changes without app switch)
- Any navigation that changes the focused window's title

```
DispatchSourceTimer (adaptive interval)
    -> checkForInAppChanges()
        -> guard state == .active (skip if idle/locked/asleep)
        -> check idle: CGEventSource.secondsSinceLastEventType > 60s
           -> if idle: transition to .idle, return
        -> readWindowContext(for: pid) -> WindowContext struct
        -> compare with lastWindowTitle / lastURL
        -> if titleChanged: debounce 2s (title-only changes)
        -> if urlChanged or appChanged: switchFocus() immediately
        -> reschedule timer if interval tier changed
```

**Adaptive intervals** — the timer interval increases as context becomes stable:

| Tier | Condition | Base Interval |
|---|---|---|
| Active | < 30s since last change | 3.0s |
| Stable | 30s – 5min since last change | 6.0s |
| Deep Focus | > 5min since last change | 12.0s |

All intervals are multiplied by **1.5×** when macOS Low Power Mode is enabled. Timer leeway is set to 20% of the interval, enabling macOS wake-up coalescing for additional power savings.

### 3. Title change debounce

Title-only changes (same app, same URL, different title) are debounced with a 2-second delay. If the title changes again within 2s, the previous pending change is cancelled. This reduces DB churn from rapid title flickers (e.g. loading spinners, progress indicators).

App switches and URL changes bypass the debounce and trigger `switchFocus()` immediately.

### 4. Idle detection

`CGEventSource.secondsSinceLastEventType` is checked on each timer tick. If >60 seconds since the last keyboard/mouse input, the engine transitions to `.idle` state. The timer continues running but skips expensive AX lookups. When input resumes, the engine transitions back to `.active`.

### 5. System event observers

| Observer | Event | Action |
|---|---|---|
| `lockObserver` | `screenIsLocked` | Finalize session, suspend timer |
| `unlockObserver` | `screenIsUnlocked` | Resume timer, capture focus |
| `sleepObserver` | `willSleep` | Finalize session, cancel timer |
| `wakeObserver` | `didWake` | Restart timer, capture focus |
| `powerStateObserver` | `powerStateDidChange` | Reschedule timer (interval × 1.5 in LPM) |

### 6. Startup capture

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

All AX reads go through `readWindowContext(for:)` in `TrackingEngine+WindowContext.swift`, which performs a **single focused window lookup** and returns a `WindowContext` struct containing all attributes in one pass:

```swift
struct WindowContext {
    let title: String?
    let documentPath: String?
    let isFullScreen: Bool
    let isMinimized: Bool
}
```

The method creates an `AXUIElement` from the app's PID via `AXUIElementCreateApplication(pid)`, reads `kAXFocusedWindowAttribute` to get the focused window, then reads all attributes from that single window element.

| Field | AX Attribute | Notes |
|---|---|---|
| `windowTitle` | `kAXTitleAttribute` | Read from focused window element |
| `documentPath` | `kAXDocumentAttribute` | Returns `file://` URL, converted to path. Supported by TextEdit, Xcode, Preview. Nil for most apps |
| `isFullScreen` | `"AXFullScreen"` (string literal) | Boolean, defaults to `false` |
| `isMinimized` | `kAXMinimizedAttribute` | Boolean, defaults to `false` |

**Required permission:** Accessibility (prompted via `AXIsProcessTrustedWithOptions`).

### Source C: AppleScript (browser-specific)

For recognized browsers, an AppleScript extracts URL, tab title, and tab count from the frontmost window. Executed on a background thread. **Non-browser apps skip AppleScript entirely** — the `BrowserURLFetcher.isBrowser(appName:)` guard is checked before any AppleScript work.

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
                  lastChangeTime = now          -> reset adaptive interval tier
```

**Active session indicator:** A session is active when `duration == 0 && endTime == startTime`. It has been created but not yet finalized.

**Finalization trigger:** The current session is finalized when `switchFocus()` is called — either by the workspace notification (app switch) or the fallback timer (in-app context change).

---

## Permissions

Two macOS permissions are required, both checked by `PermissionManager` with exponential backoff polling (2s → 5s → 10s → 30s). Polling stops entirely once all permissions are granted.

| Permission | Purpose | Check API | Prompt API |
|---|---|---|---|
| Accessibility | Read window titles, document paths, fullscreen/minimized state | `AXIsProcessTrusted()` | `AXIsProcessTrustedWithOptions` |
| Automation | Execute AppleScript to read browser URLs | Heuristic (test script to System Events) | Triggered on first AppleScript execution |

**App configuration:**

- `LSUIElement: false` — Regular app with a Dock icon and a persistent menu-bar extra
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
│  GCD Timer (3/6/12s) ──poll──> checkForInAppChanges()       │
│                                     │                       │
│  System Events ──────────────> Observers                    │
│  (lock/unlock/sleep/wake/LPM)  (suspend/resume/cancel)     │
│                                     │                       │
│                              ┌──────┴──────┐                │
│                              │ switchFocus()│                │
│                              └──────┬──────┘                │
│                                     │                       │
│                    ┌────────────────┼────────────────┐      │
│                    │                │                │      │
│            readWindowContext   NSRunningApp      AppleScript  │
│            (single AX lookup)  (System)     (browsers only)  │
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
│                           DatabaseManager (.utility QoS)    │
│                              (GRDB/SQLite)                  │
│                                     │                       │
│                              gecko.sqlite                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
