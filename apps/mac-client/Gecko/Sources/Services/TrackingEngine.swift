import Cocoa
import Combine

/// The core focus tracking engine.
///
/// **Architecture:**
/// 1. **Event-driven**: Listens to `NSWorkspace.didActivateApplicationNotification`
///    to detect app switches with zero polling overhead.
/// 2. **Adaptive fallback timer**: A GCD timer detects in-app changes (e.g., switching
///    tabs in Chrome without switching apps). The interval adapts based on context
///    stability: 3s (active) → 6s (stable >30s) → 12s (deep focus >5min).
/// 3. **Session lifecycle**: On each focus change, the previous session is finalized
///    (end_time + duration computed) and a new session is inserted.
/// 4. **Off-main-thread**: AppleScript (browser URL) and DB operations run on
///    background threads to keep the UI responsive.
/// 5. **Rich context**: Captures bundle ID, browser tab info, document path,
///    full-screen and minimized state via Accessibility API.
/// 6. **Energy-aware**: Skips polling when user is idle (>60s), screen is locked,
///    or the system is asleep. Applies a 1.5x interval multiplier in Low Power Mode.
///    Timer leeway enables macOS wake-up coalescing.
@MainActor
final class TrackingEngine: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking: Bool = false
    @Published private(set) var currentSession: FocusSession?

    // MARK: - Dependencies

    private let db: any DatabaseService

    // MARK: - Private State

    private var workspaceObserver: NSObjectProtocol?

    /// Tracks the last known window title + URL to detect in-app changes.
    private var lastWindowTitle: String = ""
    private var lastURL: String?

    // MARK: - Energy: System Observers

    private var lockObserver: NSObjectProtocol?
    private var unlockObserver: NSObjectProtocol?
    private var sleepObserver: NSObjectProtocol?
    private var wakeObserver: NSObjectProtocol?
    private var powerStateObserver: NSObjectProtocol?

    /// Whether the screen is currently locked. When true, polling is skipped.
    private var isScreenLocked: Bool = false

    // MARK: - Energy: Adaptive Polling

    /// Tracks when the last focus context change occurred, for adaptive interval calculation.
    private var lastChangeTime: Date = Date()

    /// The current interval tier, used to detect tier transitions and avoid unnecessary rescheduling.
    private var currentIntervalTier: TimeInterval = 0

    /// GCD timer source that supports dynamic rescheduling without invalidation.
    private var fallbackSource: DispatchSourceTimer?

    // MARK: - Constants

    /// User idle threshold in seconds. Beyond this, polling ticks are skipped.
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
        guard !isTracking else { return }
        isTracking = true

        // Subscribe to app activation events
        workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in
                await self?.handleAppActivation(notification)
            }
        }

        // Energy: observe screen lock/unlock to pause/resume polling
        registerSystemObservers()

        // Start the fallback timer for in-app changes
        startFallbackTimer()

        // Capture the currently active app immediately
        Task {
            await captureCurrentFocus()
        }
    }

    /// Stop tracking and finalize the current session.
    func stop() {
        guard isTracking else { return }
        isTracking = false

        if let observer = workspaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
            workspaceObserver = nil
        }

        removeSystemObservers()

        fallbackSource?.cancel()
        fallbackSource = nil

        finalizeCurrentSessionQuietly()
    }

    // MARK: - Event Handlers

    /// Called when a new app is activated (event-driven, zero polling).
    private func handleAppActivation(_ notification: Notification) async {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else {
            return
        }

        let appName = app.localizedName ?? "Unknown"
        let bundleId = app.bundleIdentifier
        let wCtx = readWindowContext(for: app)
        // Energy: only run AppleScript for known browsers
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil

        switchFocus(FocusContext(
            appName: appName,
            bundleId: bundleId,
            windowTitle: wCtx.title,
            browserInfo: browserInfo,
            documentPath: wCtx.documentPath,
            isFullScreen: wCtx.isFullScreen,
            isMinimized: wCtx.isMinimized
        ))
    }

    /// Fallback: check if window title or URL changed within the same app.
    private func checkForInAppChanges() async {
        guard isTracking, !isScreenLocked else { return }

        // Energy: skip if user has been idle for over 60 seconds
        let idleSeconds = CGEventSource.secondsSinceLastEventType(
            .combinedSessionState,
            eventType: .null  // checks all input event types (mouse, keyboard, etc.)
        )
        guard idleSeconds < Self.idleThreshold else { return }

        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier
        let wCtx = readWindowContext(for: frontApp)
        // Energy: only run AppleScript for known browsers
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil
        let url = browserInfo?.url

        // Only switch if something actually changed
        let titleChanged = wCtx.title != lastWindowTitle
        let urlChanged = url != lastURL

        if titleChanged || urlChanged {
            switchFocus(FocusContext(
                appName: appName,
                bundleId: bundleId,
                windowTitle: wCtx.title,
                browserInfo: browserInfo,
                documentPath: wCtx.documentPath,
                isFullScreen: wCtx.isFullScreen,
                isMinimized: wCtx.isMinimized
            ))
        }
    }

    /// Capture whatever app is currently focused (used on engine start).
    private func captureCurrentFocus() async {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier
        let wCtx = readWindowContext(for: frontApp)
        // Energy: only run AppleScript for known browsers
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil

        switchFocus(FocusContext(
            appName: appName,
            bundleId: bundleId,
            windowTitle: wCtx.title,
            browserInfo: browserInfo,
            documentPath: wCtx.documentPath,
            isFullScreen: wCtx.isFullScreen,
            isMinimized: wCtx.isMinimized
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
        // Finalize the previous session
        finalizeCurrentSessionQuietly()

        // Update tracking state
        lastWindowTitle = ctx.windowTitle
        lastURL = ctx.browserInfo?.url

        // Reset adaptive interval to active tier
        lastChangeTime = Date()
        rescheduleIfNeeded()

        // Create the new session
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

        // Optimistic UI update, then persist on a background thread
        currentSession = session
        let database = db
        Task.detached(priority: .userInitiated) {
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

        // Clear UI state immediately, persist on background thread
        currentSession = nil
        let database = db
        Task.detached(priority: .userInitiated) {
            do {
                try database.update(session)
            } catch {
                print("[TrackingEngine] Failed to finalize session: \(error)")
            }
        }
    }

    // MARK: - Energy: Timer Management

    /// Create and start the fallback GCD timer with adaptive interval.
    private func startFallbackTimer() {
        fallbackSource?.cancel()
        let interval = adaptiveInterval
        currentIntervalTier = interval
        let source = DispatchSource.makeTimerSource(queue: .main)
        source.schedule(deadline: .now() + interval,
                        repeating: interval,
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

    /// Reschedule the GCD timer if the adaptive interval tier has changed.
    private func rescheduleIfNeeded() {
        let newInterval = adaptiveInterval
        guard newInterval != currentIntervalTier else { return }
        currentIntervalTier = newInterval
        fallbackSource?.schedule(deadline: .now() + newInterval,
                                 repeating: newInterval,
                                 leeway: .seconds(1))
    }

    // MARK: - Energy: System Observers (Lock/Unlock, Sleep/Wake)

    /// Register observers for screen lock/unlock, system sleep/wake, and power state changes.
    private func registerSystemObservers() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        let distCenter = DistributedNotificationCenter.default()

        // Screen lock: pause polling, finalize session
        lockObserver = distCenter.addObserver(
            forName: NSNotification.Name("com.apple.screenIsLocked"),
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isScreenLocked = true
                self?.finalizeCurrentSessionQuietly()
            }
        }

        // Screen unlock: resume polling, recapture focus
        unlockObserver = distCenter.addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"),
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isScreenLocked = false
                await self?.captureCurrentFocus()
            }
        }

        // System sleep: stop timer, finalize session
        sleepObserver = workspaceCenter.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.fallbackSource?.cancel()
                self?.fallbackSource = nil
                self?.finalizeCurrentSessionQuietly()
            }
        }

        // System wake: restart timer, recapture focus
        wakeObserver = workspaceCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.startFallbackTimer()
                await self?.captureCurrentFocus()
            }
        }

        // Low Power Mode toggle: reschedule timer with updated battery multiplier
        powerStateObserver = NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.rescheduleIfNeeded()
            }
        }
    }

    /// Remove all system observers (lock/unlock, sleep/wake, power state).
    private func removeSystemObservers() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        let distCenter = DistributedNotificationCenter.default()

        if let obs = lockObserver { distCenter.removeObserver(obs) }
        if let obs = unlockObserver { distCenter.removeObserver(obs) }
        if let obs = sleepObserver { workspaceCenter.removeObserver(obs) }
        if let obs = wakeObserver { workspaceCenter.removeObserver(obs) }
        if let obs = powerStateObserver { NotificationCenter.default.removeObserver(obs) }

        lockObserver = nil
        unlockObserver = nil
        sleepObserver = nil
        wakeObserver = nil
        powerStateObserver = nil
        isScreenLocked = false
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
