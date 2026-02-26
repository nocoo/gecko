import Cocoa
import Combine

/// ViewModel for the menu bar dropdown.
///
/// Exposes tracking status, permission state, and actions needed by MenuBarView.
/// Decouples the view from TrackingEngine, PermissionManager, and app lifecycle.
@MainActor
final class MenuBarViewModel: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking: Bool = false
    @Published private(set) var currentAppName: String?
    @Published private(set) var currentWindowTitle: String?
    @Published private(set) var allPermissionsGranted: Bool = false

    // MARK: - Dependencies

    private let trackingEngine: TrackingEngine
    private let permissionManager: PermissionManager
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init(trackingEngine: TrackingEngine, permissionManager: PermissionManager) {
        self.trackingEngine = trackingEngine
        self.permissionManager = permissionManager
        bindState()
    }

    // MARK: - Public API

    /// Toggle tracking on/off.
    func toggleTracking() {
        if isTracking {
            trackingEngine.stop()
        } else {
            trackingEngine.start()
        }
    }

    /// Label text for the tracking toggle button.
    var toggleButtonTitle: String {
        isTracking ? "Stop Tracking" : "Start Tracking"
    }

    /// Stop tracking and terminate the app.
    func quitApp() {
        trackingEngine.stop()
        NSApplication.shared.terminate(nil)
    }

    // MARK: - Bindings

    private func bindState() {
        trackingEngine.$isTracking
            .receive(on: RunLoop.main)
            .assign(to: &$isTracking)

        trackingEngine.$currentSession
            .receive(on: RunLoop.main)
            .map(\.?.appName)
            .assign(to: &$currentAppName)

        trackingEngine.$currentSession
            .receive(on: RunLoop.main)
            .map(\.?.windowTitle)
            .assign(to: &$currentWindowTitle)

        permissionManager.$isAccessibilityGranted
            .combineLatest(permissionManager.$isAutomationGranted)
            .receive(on: RunLoop.main)
            .map { $0.0 && $0.1 }
            .assign(to: &$allPermissionsGranted)
    }
}
