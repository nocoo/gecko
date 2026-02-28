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
@MainActor
final class TrackingEngine: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking: Bool = false
    @Published private(set) var currentSession: FocusSession?
    @Published private(set) var recentSessions: [FocusSession] = []

    // MARK: - Dependencies

    private let db: any DatabaseService

    // MARK: - Private State

    private var workspaceObserver: NSObjectProtocol?
    private var fallbackTimer: Timer?

    /// Tracks the last known window title + URL to detect in-app changes.
    private var lastWindowTitle: String = ""
    private var lastURL: String?

    // MARK: - Constants

    private static let fallbackInterval: TimeInterval = 3.0
    private static let recentSessionsLimit = 50

    // MARK: - Init

    init(db: any DatabaseService = DatabaseManager.shared) {
        self.db = db
        loadRecentSessions()
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

        // Start the fallback timer for in-app changes
        fallbackTimer = Timer.scheduledTimer(
            withTimeInterval: Self.fallbackInterval,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.checkForInAppChanges()
            }
        }

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
        fallbackTimer?.invalidate()
        fallbackTimer = nil

        finalizeCurrentSession()
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
        let browserInfo = await BrowserURLFetcher.fetchInfo(appName: appName)
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
        guard isTracking else { return }
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier
        let windowTitle = readWindowTitle(for: frontApp)
        let browserInfo = await BrowserURLFetcher.fetchInfo(appName: appName)
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
        let browserInfo = await BrowserURLFetcher.fetchInfo(appName: appName)
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
        // Finalize the previous session (without reloading recent — we'll reload once at the end)
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
        loadRecentSessions()
    }

    /// Finalize the current session by setting end_time and duration, then reload.
    private func finalizeCurrentSession() {
        finalizeCurrentSessionQuietly()
        loadRecentSessions()
    }

    /// Finalize the current session without reloading recent sessions.
    /// Used internally by `switchFocus` to avoid a redundant reload.
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

    // MARK: - Data Loading

    /// Reload recent sessions from the database on a background thread.
    func loadRecentSessions() {
        let database = db
        let limit = Self.recentSessionsLimit
        Task.detached(priority: .userInitiated) {
            do {
                let sessions = try database.fetchRecent(limit: limit)
                await MainActor.run {
                    self.recentSessions = sessions
                }
            } catch {
                print("[TrackingEngine] Failed to load recent sessions: \(error)")
            }
        }
    }
}
