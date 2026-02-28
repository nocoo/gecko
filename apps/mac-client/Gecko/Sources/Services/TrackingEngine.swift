import Cocoa
import Combine

/// The core focus tracking engine.
///
/// **Architecture:**
/// 1. **State machine**: A single `TrackingState` enum replaces ad-hoc boolean flags.
///    Transitions are explicit and side effects (timer start/stop, session lifecycle)
///    are co-located in `transition(to:)`.
/// 2. **Event-driven**: Listens to `NSWorkspace.didActivateApplicationNotification`
///    to detect app switches with zero polling overhead.
/// 3. **Adaptive fallback timer**: A GCD timer detects in-app changes (e.g., switching
///    tabs in Chrome without switching apps). The interval adapts based on context
///    stability: 3s (active) → 6s (stable >30s) → 12s (deep focus >5min).
/// 4. **Session lifecycle**: On each focus change, the previous session is finalized
///    (end_time + duration computed) and a new session is inserted.
/// 5. **Off-main-thread**: AppleScript (browser URL) and DB operations run on
///    background threads to keep the UI responsive.
/// 6. **Rich context**: Captures bundle ID, browser tab info, document path,
///    full-screen and minimized state via Accessibility API (single AX lookup).
/// 7. **Energy-aware**: Skips polling when user is idle (>60s), screen is locked,
///    or the system is asleep. Applies a 1.5x interval multiplier in Low Power Mode.
///    Timer leeway enables macOS wake-up coalescing.
@MainActor
final class TrackingEngine: ObservableObject {

    // MARK: - State Machine

    /// All possible engine states. Replaces ad-hoc `isTracking` + `isScreenLocked` booleans.
    enum TrackingState: Equatable {
        /// Engine is stopped. No timers, no observers (except lifecycle).
        case stopped
        /// User is actively using the Mac. Full polling at adaptive intervals.
        case active
        /// User has been idle for >60s. Timer runs but skips expensive work.
        case idle
        /// Screen is locked. Timer suspended. Session finalized.
        case locked
        /// System is asleep. Timer cancelled. Session finalized.
        case asleep
    }

    // MARK: - Published State

    /// Current engine state, observable by UI.
    @Published private(set) var state: TrackingState = .stopped

    /// Convenience for views: true when the engine is running (any state except `.stopped`).
    @Published private(set) var isTracking: Bool = false

    @Published private(set) var currentSession: FocusSession?

    // MARK: - Dependencies

    private let db: any DatabaseService

    // MARK: - State (shared with extensions)

    var workspaceObserver: NSObjectProtocol?

    /// Tracks the last known app + window title + URL to detect in-app changes.
    private var lastAppName: String = ""
    private var lastWindowTitle: String = ""
    private var lastURL: String?

    // MARK: - Energy: Title Debounce

    /// Pending title awaiting debounce confirmation.
    private var pendingTitleChange: String?
    /// The debounce task that will commit the title change after the interval.
    private var titleDebounceTask: Task<Void, Never>?
    /// Debounce interval for title-only changes (seconds).
    private static let titleDebounceInterval: TimeInterval = 2.0

    // MARK: - Energy: System Observers

    var lockObserver: NSObjectProtocol?
    var unlockObserver: NSObjectProtocol?
    var sleepObserver: NSObjectProtocol?
    var wakeObserver: NSObjectProtocol?
    var powerStateObserver: NSObjectProtocol?

    // MARK: - Energy: Adaptive Polling

    /// Tracks when the last focus context change occurred, for adaptive interval calculation.
    private var lastChangeTime: Date = Date()

    /// The current interval tier, used to detect tier transitions and avoid unnecessary rescheduling.
    private var currentIntervalTier: TimeInterval = 0

    /// GCD timer source that supports dynamic rescheduling without invalidation.
    private var fallbackSource: DispatchSourceTimer?

    // MARK: - Constants

    /// User idle threshold in seconds. Beyond this, transition to `.idle`.
    private static let idleThreshold: TimeInterval = 60.0

    /// Adaptive interval tier boundaries (seconds since last context change).
    private static let stableThreshold: TimeInterval = 30.0
    private static let deepFocusThreshold: TimeInterval = 300.0

    /// Base polling intervals per tier.
    private static let activeInterval: TimeInterval = 3.0
    private static let stableInterval: TimeInterval = 6.0
    private static let deepFocusInterval: TimeInterval = 12.0

    // MARK: - Init

    init(db: any DatabaseService = DatabaseManager.shared) {
        self.db = db
    }

    // MARK: - Energy: Adaptive Interval

    /// Battery-aware multiplier: 1.5x when Low Power Mode is enabled.
    private var batteryMultiplier: Double {
        ProcessInfo.processInfo.isLowPowerModeEnabled ? 1.5 : 1.0
    }

    /// Compute the adaptive polling interval based on how long the context has been stable.
    private var adaptiveInterval: TimeInterval {
        let elapsed = Date().timeIntervalSince(lastChangeTime)
        let base: TimeInterval
        if elapsed < Self.stableThreshold {
            base = Self.activeInterval
        } else if elapsed < Self.deepFocusThreshold {
            base = Self.stableInterval
        } else {
            base = Self.deepFocusInterval
        }
        return base * batteryMultiplier
    }

    // MARK: - Public API

    /// Start tracking focus sessions.
    func start() {
        guard state == .stopped else { return }
        transition(to: .active)
    }

    /// Stop tracking and finalize the current session.
    func stop() {
        guard state != .stopped else { return }
        transition(to: .stopped)
    }

    // MARK: - State Machine Core

    /// Perform a state transition with co-located side effects.
    ///
    /// **Design rules:**
    /// 1. One state at a time — no boolean combinations.
    /// 2. Each notification maps to exactly one transition.
    /// 3. Side effects (timer, session, observers) are handled here, not scattered.
    func transition(to newState: TrackingState) {
        guard state != newState else { return }
        let oldState = state
        state = newState
        isTracking = (newState != .stopped)

        switch newState {
        case .stopped:
            cancelTitleDebounce()
            cancelFallbackTimer()
            removeWorkspaceObserver()
            removeSystemObservers()
            finalizeCurrentSessionQuietly()

        case .active:
            if oldState == .stopped {
                registerWorkspaceObserver()
                registerSystemObservers()
                startFallbackTimer()
                Task { await captureCurrentFocus() }
            } else if oldState == .asleep {
                // Timer was cancelled on sleep — recreate it
                startFallbackTimer()
                Task { await captureCurrentFocus() }
            } else if oldState == .locked {
                // Timer was suspended on lock — resume it
                fallbackSource?.resume()
                Task { await captureCurrentFocus() }
            } else if oldState == .idle {
                // Returning from idle — recapture focus
                Task { await captureCurrentFocus() }
            }

        case .idle:
            cancelTitleDebounce()
            finalizeCurrentSessionQuietly()
            // Timer keeps running so we can detect return-to-active

        case .locked:
            cancelTitleDebounce()
            fallbackSource?.suspend()
            finalizeCurrentSessionQuietly()

        case .asleep:
            cancelTitleDebounce()
            cancelFallbackTimer()
            finalizeCurrentSessionQuietly()
        }
    }

    // MARK: - Event Handlers

    /// Called when a new app is activated (event-driven, zero polling).
    func handleAppActivation(_ notification: Notification) async {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey]
                as? NSRunningApplication else { return }

        cancelTitleDebounce()

        let appName = app.localizedName ?? "Unknown"
        let bundleId = app.bundleIdentifier
        let wCtx = readWindowContext(for: app)
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil

        switchFocus(FocusContext(
            appName: appName, bundleId: bundleId,
            windowTitle: wCtx.title, browserInfo: browserInfo,
            documentPath: wCtx.documentPath,
            isFullScreen: wCtx.isFullScreen, isMinimized: wCtx.isMinimized
        ))
    }

    /// Fallback: check if window title or URL changed within the same app.
    private func checkForInAppChanges() async {
        // State-based guard: only poll in .active (idle/locked/asleep skip)
        guard state == .active else { return }

        // Idle detection: transition to .idle if user has been inactive
        let idleSeconds = CGEventSource.secondsSinceLastEventType(
            .combinedSessionState, eventType: .null
        )
        if idleSeconds >= Self.idleThreshold {
            transition(to: .idle)
            return
        }

        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier
        let wCtx = readWindowContext(for: frontApp)
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil
        let url = browserInfo?.url

        let appChanged = appName != lastAppName
        let urlChanged = url != lastURL
        let titleChanged = wCtx.title != lastWindowTitle

        // App change or URL change: immediate switch (high confidence)
        if appChanged || urlChanged {
            cancelTitleDebounce()
            switchFocus(FocusContext(
                appName: appName, bundleId: bundleId,
                windowTitle: wCtx.title, browserInfo: browserInfo,
                documentPath: wCtx.documentPath,
                isFullScreen: wCtx.isFullScreen, isMinimized: wCtx.isMinimized
            ))
            return
        }

        // Title-only change: debounce to avoid micro-sessions from rapid title churn
        if titleChanged {
            if pendingTitleChange != wCtx.title {
                pendingTitleChange = wCtx.title
                cancelTitleDebounce()
                let context = FocusContext(
                    appName: appName, bundleId: bundleId,
                    windowTitle: wCtx.title, browserInfo: browserInfo,
                    documentPath: wCtx.documentPath,
                    isFullScreen: wCtx.isFullScreen, isMinimized: wCtx.isMinimized
                )
                titleDebounceTask = Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(Self.titleDebounceInterval))
                    guard !Task.isCancelled, let self else { return }
                    self.switchFocus(context)
                    self.pendingTitleChange = nil
                }
            }
        }
    }

    /// Timer tick handler for the `.idle` state — check if user has returned.
    private func checkIdleReturn() {
        guard state == .idle else { return }

        let idleSeconds = CGEventSource.secondsSinceLastEventType(
            .combinedSessionState, eventType: .null
        )
        if idleSeconds < Self.idleThreshold {
            transition(to: .active)
        }
    }

    /// Capture whatever app is currently focused (used on engine start / wake / unlock).
    private func captureCurrentFocus() async {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier
        let wCtx = readWindowContext(for: frontApp)
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil

        switchFocus(FocusContext(
            appName: appName, bundleId: bundleId,
            windowTitle: wCtx.title, browserInfo: browserInfo,
            documentPath: wCtx.documentPath,
            isFullScreen: wCtx.isFullScreen, isMinimized: wCtx.isMinimized
        ))
    }

    // MARK: - Core Logic

    /// All context gathered about the currently focused window.
    private struct FocusContext {
        let appName: String
        let bundleId: String?
        let windowTitle: String
        let browserInfo: BrowserInfo?
        let documentPath: String?
        let isFullScreen: Bool
        let isMinimized: Bool
    }

    /// Handle a focus switch: finalize previous session, start new one.
    private func switchFocus(_ ctx: FocusContext) {
        finalizeCurrentSessionQuietly()

        lastAppName = ctx.appName
        lastWindowTitle = ctx.windowTitle
        lastURL = ctx.browserInfo?.url

        // Reset adaptive interval to active tier
        lastChangeTime = Date()
        rescheduleIfNeeded()

        let session = FocusSession.start(
            appName: ctx.appName,
            windowTitle: ctx.windowTitle,
            bundleId: ctx.bundleId,
            url: ctx.browserInfo?.url,
            tabTitle: ctx.browserInfo?.tabTitle,
            tabCount: ctx.browserInfo?.tabCount,
            documentPath: ctx.documentPath,
            isFullScreen: ctx.isFullScreen,
            isMinimized: ctx.isMinimized
        )

        // Optimistic UI update, then persist at .utility priority
        currentSession = session
        let database = db
        Task.detached(priority: .utility) {
            do {
                try database.insert(session)
            } catch {
                print("[TrackingEngine] Failed to insert session: \(error)")
            }
        }
    }

    /// Finalize the current session by setting end_time and duration.
    private func finalizeCurrentSessionQuietly() {
        guard var session = currentSession else { return }
        guard session.isActive else { return }

        session.finish()

        currentSession = nil
        let database = db
        Task.detached(priority: .utility) {
            do {
                try database.update(session)
            } catch {
                print("[TrackingEngine] Failed to finalize session: \(error)")
            }
        }
    }

    // MARK: - Timer Management

    /// Create and start the fallback GCD timer with adaptive interval.
    private func startFallbackTimer() {
        cancelFallbackTimer()
        let interval = adaptiveInterval
        currentIntervalTier = interval
        let source = DispatchSource.makeTimerSource(queue: .main)
        source.schedule(deadline: .now() + interval,
                        repeating: interval,
                        leeway: .seconds(1))
        source.setEventHandler { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.state == .idle {
                    self.checkIdleReturn()
                } else {
                    await self.checkForInAppChanges()
                }
                self.rescheduleIfNeeded()
            }
        }
        source.resume()
        fallbackSource = source
    }

    /// Reschedule the GCD timer if the adaptive interval tier has changed.
    func rescheduleIfNeeded() {
        let newInterval = adaptiveInterval
        guard newInterval != currentIntervalTier else { return }
        currentIntervalTier = newInterval
        fallbackSource?.schedule(deadline: .now() + newInterval,
                                 repeating: newInterval,
                                 leeway: .seconds(1))
    }

    /// Cancel and nil out the fallback timer.
    private func cancelFallbackTimer() {
        fallbackSource?.cancel()
        fallbackSource = nil
    }

    /// Cancel any pending title debounce.
    private func cancelTitleDebounce() {
        titleDebounceTask?.cancel()
        titleDebounceTask = nil
        pendingTitleChange = nil
    }

    // MARK: - AX Window Context (Cached Lookup)

    /// All Accessibility attributes read from the focused window in a single pass.
    struct WindowContext {
        var title: String = ""
        var documentPath: String?
        var isFullScreen: Bool = false
        var isMinimized: Bool = false
    }
}
