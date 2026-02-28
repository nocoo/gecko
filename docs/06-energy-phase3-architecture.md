# Energy Efficiency — Phase 3: Architecture Refactoring

## Overview

Phase 3 restructures the `TrackingEngine` around a formal state machine, replaces ad-hoc boolean flags with clean state transitions, and applies deeper optimizations to DB writes and sync behavior. This is the "do it right" phase that sets the foundation for long-term maintainability.

**Prerequisite:** Phase 1 and Phase 2 must be completed first.

---

## Problem 1: Multiple Boolean Flags Instead of a State Machine

**File:** `TrackingEngine.swift`

**Impact:** Architectural (correctness risk, hard to reason about)

After Phase 1 and 2, the engine will have accumulated several independent flags:

- `isTracking: Bool`
- `isScreenLocked: Bool`
- `isSystemSleeping: Bool` (implicit from sleep/wake observers)
- `isIdle: Bool` (implicit from idle detection)
- Adaptive interval tier (active/stable/deep focus)

These interact in complex ways. For example: What happens if the system wakes but the screen stays locked? What if the user becomes idle while in Low Power Mode? Boolean combinations create 2^N states, most of which are untested.

### Fix: Formal State Machine

Replace all boolean flags with a single `TrackingState` enum:

```swift
enum TrackingState: Equatable {
    /// Engine is stopped. No timers, no observers (except lifecycle).
    case stopped

    /// User is actively using the Mac. Full polling at adaptive intervals.
    case active

    /// User has been idle for >60 seconds. Timer runs but skips expensive work.
    /// Transitions back to .active on first user input.
    case idle

    /// Screen is locked. Timer paused. Session finalized.
    case locked

    /// System is asleep. All timers invalidated. Session finalized.
    case asleep
}
```

State transitions:

```
                    start()
    stopped ─────────────────────► active
       ▲                             │
       │ stop()                      │
       │                  ┌──────────┼──────────────┐
       │                  │          │              │
       │            idle >60s    screenLock     willSleep
       │                  │          │              │
       │                  ▼          ▼              ▼
       │                idle      locked         asleep
       │                  │          │              │
       │            user input   screenUnlock   didWake
       │                  │          │              │
       │                  └──────────┴──────────────┘
       │                             │
       │                             ▼
       │                          active
       │                             │
       └─────────────────────────────┘
                    stop()
```

**Key design rules:**

1. **One state at a time.** No boolean combinations.
2. **Transitions are explicit.** Each `NSNotification` or idle check maps to exactly one transition.
3. **Side effects are co-located.** Each transition defines what happens (start/stop timer, finalize session, capture focus).

```swift
@Published private(set) var state: TrackingState = .stopped

private func transition(to newState: TrackingState) {
    guard state != newState else { return }
    let oldState = state

    // Exit actions
    switch oldState {
    case .active:
        break  // nothing special on exit
    case .idle:
        break
    case .locked, .asleep:
        break
    case .stopped:
        break
    }

    state = newState

    // Entry actions
    switch newState {
    case .stopped:
        fallbackSource?.cancel()
        fallbackSource = nil
        removeAllObservers()
        finalizeCurrentSessionQuietly()

    case .active:
        if oldState == .stopped {
            registerWorkspaceObserver()
            registerSystemObservers()
        }
        startOrRescheduleTimer()
        if oldState != .stopped {
            // Returning from idle/locked/asleep — recapture focus
            Task { await captureCurrentFocus() }
        }

    case .idle:
        // Timer keeps running (to detect return-to-active)
        // but checkForInAppChanges() will early-return
        finalizeCurrentSessionQuietly()

    case .locked:
        fallbackSource?.suspend()
        finalizeCurrentSessionQuietly()

    case .asleep:
        fallbackSource?.cancel()
        fallbackSource = nil
        finalizeCurrentSessionQuietly()
    }
}
```

**Benefits:**
- Eliminates impossible state combinations (e.g., `isTracking && isScreenLocked && isSystemSleeping` all true).
- Easy to add new states later (e.g., `.lowPower`, `.displayOff`).
- Testable: each transition can be unit-tested independently.

---

## Problem 2: DB Writes Use High QoS Priority

**File:** `TrackingEngine.swift:217, 236`

**Impact:** Low-Medium (unnecessary scheduler pressure)

`Task.detached(priority: .userInitiated)` is used for all DB inserts and updates. `.userInitiated` tells the OS this work needs to happen *now* and is blocking the user — which is false for background persistence. This prevents the CPU from downclocking and increases power state transitions.

### Fix: Lower DB Task Priority

```swift
// Before
Task.detached(priority: .userInitiated) {
    try? db.insert(session)
}

// After
Task.detached(priority: .utility) {
    try? db.insert(session)
}
```

`.utility` tells the OS this is important but not time-sensitive — perfect for background persistence. The CPU can batch and schedule these writes more efficiently.

**Energy savings:** Reduced CPU power-state transitions. Hard to quantify in isolation (~5-10%).  
**Accuracy impact:** None — writes still happen promptly, just at lower scheduler priority.

---

## Problem 3: Rapid Title Churn Creates Excessive Sessions

**File:** `TrackingEngine.swift:125-154` (`checkForInAppChanges`)

**Impact:** Medium (DB write churn, session fragmentation)

Some apps update their window title frequently:
- IDEs append "saving..." or "compiling..." to the title
- Browsers update the title for loading pages
- Terminals show the currently running command

Each title change triggers `switchFocus()` → finalize old session → insert new session → 2 DB writes. A rapidly changing title can produce dozens of micro-sessions per minute.

### Fix: Debounce Title Changes

Add a short debounce window before committing to a context switch for title-only changes:

```swift
private var pendingTitleChange: String?
private var titleDebounceTask: Task<Void, Never>?
private static let titleDebounceInterval: TimeInterval = 2.0

private func checkForInAppChanges() async {
    // ... idle/lock checks ...

    let currentTitle = readWindowTitle(for: frontApp)
    let currentURL = await fetchBrowserURL(for: appName)

    // App change or URL change: immediate switch (high confidence)
    if appName != lastAppName || currentURL != lastURL {
        cancelTitleDebounce()
        switchFocus(newContext)
        return
    }

    // Title-only change: debounce
    if currentTitle != lastWindowTitle {
        if pendingTitleChange != currentTitle {
            pendingTitleChange = currentTitle
            cancelTitleDebounce()
            titleDebounceTask = Task { @MainActor in
                try? await Task.sleep(for: .seconds(Self.titleDebounceInterval))
                guard !Task.isCancelled else { return }
                // Title is still the same after debounce — commit the switch
                self.switchFocus(newContext)
                self.pendingTitleChange = nil
            }
        }
    }
}
```

**Energy savings:** Reduces DB writes by 30-50% for title-heavy workflows.  
**Accuracy impact:** Title changes reflected 2 seconds later. App/URL changes remain instant.

---

## Problem 4: SyncService Has No Network Awareness

**File:** `SyncService.swift:164-168`

**Impact:** Low (wasted HTTP attempts when offline)

The 5-minute sync timer fires regardless of network availability. When offline (airplane mode, no WiFi), each sync attempt creates a URLSession task that fails after a timeout, wasting CPU and potentially radio power.

### Fix: NWPathMonitor Gating

```swift
import Network

private let networkMonitor = NWPathMonitor()
private var isNetworkAvailable = true

private func startNetworkMonitor() {
    networkMonitor.pathUpdateHandler = { [weak self] path in
        Task { @MainActor in
            self?.isNetworkAvailable = (path.status == .satisfied)
        }
    }
    networkMonitor.start(queue: DispatchQueue.global(qos: .utility))
}

func syncNow() async {
    guard isNetworkAvailable else {
        logger.debug("Sync skipped: no network")
        return
    }
    // ... existing sync logic
}
```

**Energy savings:** Eliminates futile HTTP requests when offline.  
**Accuracy impact:** None — sync resumes automatically when network returns.

---

## Proposed Final Architecture

After all three phases, the `TrackingEngine` architecture looks like:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TrackingEngine (State Machine)                   │
│                                                                     │
│  State: .stopped | .active | .idle | .locked | .asleep              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Event Sources                             │   │
│  │                                                              │   │
│  │  NSWorkspace.didActivateApplication  ──► handleAppSwitch()  │   │
│  │  NSWorkspace.willSleep / didWake     ──► transition()       │   │
│  │  NSWorkspace.screensDidLock/Unlock   ──► transition()       │   │
│  │  NSProcessInfo.powerStateDidChange   ──► reschedule()       │   │
│  │  NWPathMonitor                       ──► SyncService gate   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Adaptive Timer                            │   │
│  │                                                              │   │
│  │  DispatchSourceTimer (dynamic interval)                     │   │
│  │  ┌─────────┬─────────┬──────────────┐                      │   │
│  │  │ Active  │ Stable  │ Deep Focus   │  × batteryMultiplier │   │
│  │  │ 3s      │ 6s      │ 12s          │                      │   │
│  │  └─────────┴─────────┴──────────────┘                      │   │
│  │                                                              │   │
│  │  Idle check (CGEventSource) at each tick                    │   │
│  │  Title debounce (2s) for title-only changes                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Context Capture                           │   │
│  │                                                              │   │
│  │  Single AX window lookup → read all attributes              │   │
│  │  Browser AppleScript only if isBrowser(appName:)            │   │
│  │  Task.detached(priority: .utility) for DB writes            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Session Lifecycle                         │   │
│  │                                                              │   │
│  │  switchFocus() ──► finalize old + insert new                │   │
│  │  finalizeQuietly() ──► on idle/lock/sleep/stop transitions  │   │
│  │  captureCurrentFocus() ──► on active entry from any state   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Energy Budget Comparison

| Scenario | Before (all phases) | After (all phases) |
|---|---|---|
| Active browsing | 20 wake-ups/min + 20 AppleScript/min | 5-10 wake-ups/min, AppleScript only for browsers |
| Focused coding (same file) | 20 wake-ups/min | 5 wake-ups/min (deep focus tier) |
| AFK (idle > 60s) | 20 wake-ups/min | 0 (skipped by idle guard) |
| Screen locked | 20 wake-ups/min | 0 (paused by lock observer) |
| System sleeping | Timer fires on dark wake | 0 (timer invalidated) |
| Low Power Mode + coding | 20 wake-ups/min | 3-4 wake-ups/min |

**Overall: 80-95% energy reduction across all usage patterns, with ≤10s detection delay in worst case (deep focus + battery).**

---

## Summary

| # | Fix | Complexity | Energy Savings | Accuracy Impact |
|---|---|---|---|---|
| 1 | State machine refactor | Medium | Correctness + maintainability | None |
| 2 | DB write priority `.utility` | Easy | ~5-10% | None |
| 3 | Title change debounce | Medium | 30-50% fewer DB writes | 2s delay for title changes |
| 4 | SyncService network awareness | Medium | Eliminates offline waste | None |

**Total: ~1 week of implementation. Completes the energy optimization story with a clean, testable architecture.**
