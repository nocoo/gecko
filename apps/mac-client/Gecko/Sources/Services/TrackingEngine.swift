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
@MainActor
final class TrackingEngine: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking: Bool = false
    @Published private(set) var currentSession: FocusSession?
    @Published private(set) var recentSessions: [FocusSession] = []

    // MARK: - Dependencies

    private let db: DatabaseManager

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

    init(db: DatabaseManager = .shared) {
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
        let windowTitle = readWindowTitle(for: app)
        let url = await BrowserURLFetcher.fetchURL(appName: appName)

        switchFocus(appName: appName, windowTitle: windowTitle, url: url)
    }

    /// Fallback: check if window title or URL changed within the same app.
    private func checkForInAppChanges() async {
        guard isTracking else { return }
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let windowTitle = readWindowTitle(for: frontApp)
        let url = await BrowserURLFetcher.fetchURL(appName: appName)

        // Only switch if something actually changed
        let titleChanged = windowTitle != lastWindowTitle
        let urlChanged = url != lastURL

        if titleChanged || urlChanged {
            switchFocus(appName: appName, windowTitle: windowTitle, url: url)
        }
    }

    /// Capture whatever app is currently focused (used on engine start).
    private func captureCurrentFocus() async {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }

        let appName = frontApp.localizedName ?? "Unknown"
        let windowTitle = readWindowTitle(for: frontApp)
        let url = await BrowserURLFetcher.fetchURL(appName: appName)

        switchFocus(appName: appName, windowTitle: windowTitle, url: url)
    }

    // MARK: - Core Logic

    /// Handle a focus switch: finalize previous session, start new one.
    private func switchFocus(appName: String, windowTitle: String, url: String?) {
        // Finalize the previous session (without reloading recent — we'll reload once at the end)
        finalizeCurrentSessionQuietly()

        // Update tracking state
        lastWindowTitle = windowTitle
        lastURL = url

        // Create and persist the new session
        let session = FocusSession.start(appName: appName, windowTitle: windowTitle, url: url)

        do {
            try db.insert(session)
            currentSession = session
            loadRecentSessions()
        } catch {
            print("[TrackingEngine] Failed to insert session: \(error)")
        }
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

        do {
            try db.update(session)
            currentSession = nil
        } catch {
            print("[TrackingEngine] Failed to finalize session: \(error)")
        }
    }

    // MARK: - Window Title (AXUIElement)

    /// Read the title of the focused window using the Accessibility API.
    private func readWindowTitle(for app: NSRunningApplication) -> String {
        let pid = app.processIdentifier
        let axApp = AXUIElementCreateApplication(pid)

        var focusedWindow: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &focusedWindow)

        guard result == .success, let window = focusedWindow else {
            return app.localizedName ?? "Unknown"
        }

        var titleValue: CFTypeRef?
        // swiftlint:disable:next force_cast
        let titleResult = AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &titleValue)

        guard titleResult == .success, let title = titleValue as? String, !title.isEmpty else {
            return app.localizedName ?? "Unknown"
        }

        return title
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
