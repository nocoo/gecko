import Cocoa
import Combine

/// The core focus tracking engine.
///
/// **Architecture:**
/// 1. **Event-driven**: Listens to `NSWorkspace.didActivateApplicationNotification`
///    to detect app switches with zero polling overhead.
/// 2. **Fallback timer**: A low-frequency timer (every 3 seconds) detects in-app
///    changes (e.g., switching tabs in Chrome without switching apps).
/// 3. **Session lifecycle**: On each focus change, the previous session is finalized
///    (end_time + duration computed) and a new session is inserted.
/// 4. **Off-main-thread**: AppleScript (browser URL) and DB operations run on
///    background threads to keep the UI responsive.
/// 5. **Rich context**: Captures bundle ID, browser tab info, document path,
///    full-screen and minimized state via Accessibility API.
/// 6. **Energy-aware**: Skips polling when user is idle (>60s), screen is locked,
///    or the system is asleep. Timer tolerance enables macOS wake-up coalescing.
@MainActor
final class TrackingEngine: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking: Bool = false
    @Published private(set) var currentSession: FocusSession?

    // MARK: - Dependencies

    private let db: any DatabaseService

    // MARK: - Private State

    private var workspaceObserver: NSObjectProtocol?
    private var fallbackTimer: Timer?

    /// Tracks the last known window title + URL to detect in-app changes.
    private var lastWindowTitle: String = ""
    private var lastURL: String?

    // MARK: - Energy: System Observers

    private var lockObserver: NSObjectProtocol?
    private var unlockObserver: NSObjectProtocol?
    private var sleepObserver: NSObjectProtocol?
    private var wakeObserver: NSObjectProtocol?

    /// Whether the screen is currently locked. When true, polling is skipped.
    private var isScreenLocked: Bool = false

    // MARK: - Constants

    private static let fallbackInterval: TimeInterval = 3.0

    /// User idle threshold in seconds. Beyond this, polling ticks are skipped.
    private static let idleThreshold: TimeInterval = 60.0

    // MARK: - Init

    init(db: any DatabaseService = DatabaseManager.shared) {
        self.db = db
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

        fallbackTimer?.invalidate()
        fallbackTimer = nil

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
        let windowTitle = readWindowTitle(for: app)
        // Energy: only run AppleScript for known browsers
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil
        let documentPath = readDocumentPath(for: app)
        let isFullScreen = readFullScreenState(for: app)
        let isMinimized = readMinimizedState(for: app)

        switchFocus(FocusContext(
            appName: appName,
            bundleId: bundleId,
            windowTitle: windowTitle,
            browserInfo: browserInfo,
            documentPath: documentPath,
            isFullScreen: isFullScreen,
            isMinimized: isMinimized
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
        let windowTitle = readWindowTitle(for: frontApp)
        // Energy: only run AppleScript for known browsers
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil
        let url = browserInfo?.url

        // Only switch if something actually changed
        let titleChanged = windowTitle != lastWindowTitle
        let urlChanged = url != lastURL

        if titleChanged || urlChanged {
            let documentPath = readDocumentPath(for: frontApp)
            let isFullScreen = readFullScreenState(for: frontApp)
            let isMinimized = readMinimizedState(for: frontApp)

            switchFocus(FocusContext(
                appName: appName,
                bundleId: bundleId,
                windowTitle: windowTitle,
                browserInfo: browserInfo,
                documentPath: documentPath,
                isFullScreen: isFullScreen,
                isMinimized: isMinimized
            ))
        }
    }

    /// Capture whatever app is currently focused (used on engine start).
    private func captureCurrentFocus() async {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier
        let windowTitle = readWindowTitle(for: frontApp)
        // Energy: only run AppleScript for known browsers
        let browserInfo: BrowserInfo? = BrowserURLFetcher.isBrowser(appName: appName)
            ? await BrowserURLFetcher.fetchInfo(appName: appName)
            : nil
        let documentPath = readDocumentPath(for: frontApp)
        let isFullScreen = readFullScreenState(for: frontApp)
        let isMinimized = readMinimizedState(for: frontApp)

        switchFocus(FocusContext(
            appName: appName,
            bundleId: bundleId,
            windowTitle: windowTitle,
            browserInfo: browserInfo,
            documentPath: documentPath,
            isFullScreen: isFullScreen,
            isMinimized: isMinimized
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

    /// Create and start the fallback timer with tolerance for wake-up coalescing.
    private func startFallbackTimer() {
        fallbackTimer?.invalidate()
        fallbackTimer = Timer.scheduledTimer(
            withTimeInterval: Self.fallbackInterval,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.checkForInAppChanges()
            }
        }
        // Allow macOS to coalesce timer wake-ups with other system activity
        fallbackTimer?.tolerance = 1.0
    }

    // MARK: - Energy: System Observers (Lock/Unlock, Sleep/Wake)

    /// Register observers for screen lock/unlock and system sleep/wake.
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
                self?.fallbackTimer?.invalidate()
                self?.fallbackTimer = nil
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
    }

    /// Remove all system observers (lock/unlock, sleep/wake).
    private func removeSystemObservers() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        let distCenter = DistributedNotificationCenter.default()

        if let obs = lockObserver { distCenter.removeObserver(obs) }
        if let obs = unlockObserver { distCenter.removeObserver(obs) }
        if let obs = sleepObserver { workspaceCenter.removeObserver(obs) }
        if let obs = wakeObserver { workspaceCenter.removeObserver(obs) }

        lockObserver = nil
        unlockObserver = nil
        sleepObserver = nil
        wakeObserver = nil
        isScreenLocked = false
    }

    // MARK: - Window Title (AXUIElement)

    /// Read the title of the focused window using the Accessibility API.
    private func readWindowTitle(for app: NSRunningApplication) -> String {
        guard let window = focusedWindow(for: app) else {
            return app.localizedName ?? "Unknown"
        }

        var titleValue: CFTypeRef?
        let titleResult = AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &titleValue)

        guard titleResult == .success, let title = titleValue as? String, !title.isEmpty else {
            return app.localizedName ?? "Unknown"
        }

        return title
    }

    // MARK: - Document Path (AXUIElement)

    /// Read the document path from the focused window via AXDocumentAttribute.
    /// Returns nil if the app doesn't expose a document path (most don't).
    private func readDocumentPath(for app: NSRunningApplication) -> String? {
        guard let window = focusedWindow(for: app) else { return nil }

        var docValue: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(window, kAXDocumentAttribute as CFString, &docValue)

        guard result == .success, let urlString = docValue as? String, !urlString.isEmpty else {
            return nil
        }

        // AXDocument typically returns a file URL string like "file:///path/to/file"
        if let url = URL(string: urlString), url.isFileURL {
            return url.path
        }
        return urlString
    }

    // MARK: - Full Screen State (AXUIElement)

    /// Read whether the focused window is in full-screen mode.
    private func readFullScreenState(for app: NSRunningApplication) -> Bool {
        guard let window = focusedWindow(for: app) else { return false }

        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(
            window,
            "AXFullScreen" as CFString,
            &value
        )

        guard result == .success, let boolValue = value as? Bool else {
            return false
        }
        return boolValue
    }

    // MARK: - Minimized State (AXUIElement)

    /// Read whether the focused window is minimized.
    private func readMinimizedState(for app: NSRunningApplication) -> Bool {
        guard let window = focusedWindow(for: app) else { return false }

        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(window, kAXMinimizedAttribute as CFString, &value)

        guard result == .success, let boolValue = value as? Bool else {
            return false
        }
        return boolValue
    }

    // MARK: - AX Helpers

    /// Get the focused window AXUIElement for an app.
    private func focusedWindow(for app: NSRunningApplication) -> AXUIElement? {
        let pid = app.processIdentifier
        let axApp = AXUIElementCreateApplication(pid)

        var focusedWindow: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &focusedWindow)

        guard result == .success, let window = focusedWindow else {
            return nil
        }

        // swiftlint:disable:next force_cast
        return (window as! AXUIElement)
    }
}
