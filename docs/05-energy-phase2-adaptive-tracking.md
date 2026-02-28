# Energy Efficiency — Phase 2: Adaptive Tracking

## Overview

Phase 2 builds on the quick wins from Phase 1 by making the tracking engine smarter about *when* and *how often* it polls. Instead of a fixed 3-second interval, the engine adapts its behavior based on user activity patterns, battery state, and application context.

**Prerequisite:** Phase 1 must be completed first (idle detection, sleep/wake, lock/unlock).

---

## Problem 1: Fixed 3-Second Polling Interval

**File:** `TrackingEngine.swift:40` (`fallbackInterval = 3.0`), `TrackingEngine.swift:67-74`

**Impact:** Medium-High (unnecessary wake-ups during stable focus periods)

After Phase 1, the timer already skips idle/locked/sleeping states. But even during *active use*, a fixed 3-second interval is wasteful when the user has been focused on the same window for minutes. Reading a long document, watching a video, or writing code in the same file — none of these require 20 polls per minute.

### Fix: Three-Tier Adaptive Interval

Track how long the current context has been stable and adjust the polling interval accordingly:

| State | Condition | Interval | Wake-ups/min |
|---|---|---|---|
| **Active** | Context changed in last 30s | 3s | 20 |
| **Stable** | Same context for 30s-5min | 6s | 10 |
| **Deep focus** | Same context for >5min | 10-12s | 5-6 |

```swift
private var lastChangeTime: Date = Date()
private var unchangedTicks: Int = 0

private var adaptiveInterval: TimeInterval {
    let elapsed = Date().timeIntervalSince(lastChangeTime)
    if elapsed < 30 {
        return 3.0   // active — user is switching frequently
    } else if elapsed < 300 {
        return 6.0   // stable — same context for 30s-5min
    } else {
        return 12.0  // deep focus — same context for >5min
    }
}
```

**Implementation note:** `Timer.scheduledTimer` does not support dynamic intervals. Two approaches:

1. **Reschedule on change:** Invalidate and recreate the timer when the interval tier changes. Simple but creates brief scheduling gaps.
2. **Use `DispatchSourceTimer`:** Supports `schedule(deadline:repeating:leeway:)` with dynamic `repeating` values. Preferred approach — no timer invalidation needed.

```swift
private var fallbackSource: DispatchSourceTimer?

private func startFallbackTimer() {
    let source = DispatchSource.makeTimerSource(queue: .main)
    source.schedule(deadline: .now() + adaptiveInterval,
                    repeating: adaptiveInterval,
                    leeway: .seconds(1))
    source.setEventHandler { [weak self] in
        Task { @MainActor in
            await self?.checkForInAppChanges()
            self?.rescheduleIfNeeded()
        }
    }
    source.resume()
    fallbackSource = source
}

private func rescheduleIfNeeded() {
    let newInterval = adaptiveInterval
    // Only reschedule if the tier changed
    fallbackSource?.schedule(deadline: .now() + newInterval,
                             repeating: newInterval,
                             leeway: .seconds(1))
}
```

When `switchFocus()` is called (context actually changed), reset `lastChangeTime` and immediately reschedule to the active interval:

```swift
private func switchFocus(_ context: FocusContext) {
    lastChangeTime = Date()
    unchangedTicks = 0
    rescheduleIfNeeded()  // snap back to 3s
    // ... existing session lifecycle
}
```

**Energy savings:** 50-70% fewer wake-ups during stable focus.  
**Accuracy impact:** Tab switches during deep focus detected 7-9s later instead of 3s. Acceptable for activity tracking.

---

## Problem 2: No Battery Awareness

**File:** `TrackingEngine.swift` — globally absent

**Impact:** Medium (battery drain on laptops)

The tracking engine behaves identically on AC power and battery. On battery, every CPU wake directly reduces battery life. macOS Low Power Mode signals that the user explicitly wants to conserve energy.

### Fix: Battery-Aware Interval Multiplier

Check `ProcessInfo.processInfo.isLowPowerModeEnabled` and apply a multiplier to polling intervals:

```swift
private var batteryMultiplier: Double {
    ProcessInfo.processInfo.isLowPowerModeEnabled ? 1.5 : 1.0
}

private var adaptiveInterval: TimeInterval {
    let base: TimeInterval
    let elapsed = Date().timeIntervalSince(lastChangeTime)
    if elapsed < 30 {
        base = 3.0
    } else if elapsed < 300 {
        base = 6.0
    } else {
        base = 12.0
    }
    return base * batteryMultiplier
}
```

With this multiplier, Low Power Mode intervals become: 4.5s / 9s / 18s.

Additionally, observe the Low Power Mode toggle to reschedule immediately:

```swift
// In start()
NotificationCenter.default.addObserver(
    forName: NSNotification.Name("NSProcessInfoPowerStateDidChangeNotification"),
    object: nil, queue: .main
) { [weak self] _ in
    Task { @MainActor in self?.rescheduleIfNeeded() }
}
```

**Energy savings:** ~40% fewer wake-ups in Low Power Mode.  
**Accuracy impact:** +1.5s detection delay in active state, +6s in deep focus. Acceptable trade.

---

## Problem 3: Redundant AX Window Lookups

**File:** `TrackingEngine.swift:248-334` (AX helper methods)

**Impact:** Medium (2-4 extra IPC calls per tick)

Each AX attribute read (`readWindowTitle`, `readDocumentPath`, `readFullScreenState`, `readMinimizedState`) independently calls `focusedWindow(for:)` which performs `AXUIElementCreateApplication(pid)` + `AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute)`. This means 4-5 AX IPC round-trips per tick when only 1 is needed.

### Fix: Cache the Focused Window Element

Fetch `AXFocusedWindow` once, then read all attributes from the cached element:

```swift
/// Read all context from the focused window in a single pass.
private func readWindowContext(for app: NSRunningApplication) -> WindowContext {
    let pid = app.processIdentifier
    let appElement = AXUIElementCreateApplication(pid)

    // One IPC call to get the focused window
    var windowValue: AnyObject?
    let result = AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &windowValue)
    guard result == .success, let window = windowValue else {
        return WindowContext()
    }

    let windowElement = window as! AXUIElement

    // Read all attributes from the cached element (one IPC each, but no redundant window lookup)
    let title = readAttribute(windowElement, kAXTitleAttribute) as? String
    let docURL = readAttribute(windowElement, kAXDocumentAttribute) as? String
    let isFullScreen = readAttribute(windowElement, "AXFullScreen" as CFString) as? Bool ?? false
    let isMinimized = readAttribute(windowElement, kAXMinimizedAttribute) as? Bool ?? false

    return WindowContext(title: title, documentPath: docURL,
                         isFullScreen: isFullScreen, isMinimized: isMinimized)
}

private func readAttribute(_ element: AXUIElement, _ attribute: CFString) -> AnyObject? {
    var value: AnyObject?
    AXUIElementCopyAttributeValue(element, attribute, &value)
    return value
}
```

Replace the separate `readWindowTitle(for:)`, `readDocumentPath(for:)`, etc. calls with a single `readWindowContext(for:)` call.

**Energy savings:** 2-4 fewer AX IPC calls per tick (~60-80% reduction in AX overhead).  
**Accuracy impact:** None — same data, fewer round-trips.

---

## Problem 4: PermissionManager Polling Has No Backoff

**File:** `PermissionManager.swift:177-181`

**Impact:** Medium (30 wake-ups/min with AppleScript while permissions ungranted)

The permission manager polls every 2 seconds with an AppleScript automation check. For first-time users who take minutes to navigate System Settings, this generates hundreds of unnecessary AppleScript executions.

### Fix: Exponential Backoff

Start at 2 seconds, then back off to 5s, 10s, 30s:

```swift
private var pollAttempts: Int = 0

private func startPolling() {
    let interval: TimeInterval
    switch pollAttempts {
    case 0..<15:   interval = 2.0    // first 30s: responsive
    case 15..<30:  interval = 5.0    // 30s-2.5min: moderate
    case 30..<60:  interval = 10.0   // 2.5-7.5min: relaxed
    default:       interval = 30.0   // 7.5min+: minimal
    }

    pollTimer?.invalidate()
    pollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
        Task { @MainActor in
            self?.pollAttempts += 1
            await self?.refreshAll()
            self?.updatePolling()
        }
    }
    pollTimer?.tolerance = interval * 0.25
}
```

Note: Use a non-repeating timer that re-schedules itself, so the interval can change dynamically.

**Energy savings:** From 30 wake-ups/min to 2-6 after initial period.  
**Accuracy impact:** Permission grant detection delayed by up to 30s in worst case. Acceptable — users expect a small delay.

---

## Summary

| # | Fix | Complexity | Energy Savings | Accuracy Impact |
|---|---|---|---|---|
| 1 | Adaptive polling (3s/6s/12s) | Medium | 50-70% during stable focus | +7-9s detection delay in deep focus |
| 2 | Battery awareness | Easy | ~40% in Low Power Mode | +1.5s in active state |
| 3 | AX window cache | Easy-Medium | 60-80% less AX overhead | None |
| 4 | Permission polling backoff | Easy | 80-90% after initial period | Up to 30s delay for grant detection |

**Total: ~3-4 hours of implementation. Significant energy reduction on top of Phase 1, with minimal accuracy trade-offs.**
