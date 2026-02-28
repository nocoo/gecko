import Foundation
import Combine

/// ViewModel for the tracking status view.
///
/// Combines tracking state and permission state into a single observable object,
/// decoupling TrackingStatusView from concrete service implementations.
@MainActor
final class TrackingViewModel: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking: Bool = false
    @Published private(set) var currentSession: FocusSession?
    @Published private(set) var isAccessibilityGranted: Bool = false
    @Published private(set) var isAutomationGranted: Bool = false

    var allPermissionsGranted: Bool {
        isAccessibilityGranted && isAutomationGranted
    }

    // MARK: - Dependencies

    private let trackingEngine: TrackingEngine
    private let permissionManager: PermissionManager
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init(trackingEngine: TrackingEngine, permissionManager: PermissionManager) {
        self.trackingEngine = trackingEngine
        self.permissionManager = permissionManager
        bindToEngine()
        bindToPermissions()
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

    /// Request accessibility permission.
    func requestAccessibility() {
        permissionManager.requestAccessibility()
    }

    /// Reset and re-request accessibility permission.
    func resetAndRequestAccessibility() {
        permissionManager.resetAndRequestAccessibility()
    }

    /// Open accessibility settings in System Preferences.
    func openAccessibilitySettings() {
        permissionManager.openAccessibilitySettings()
    }

    /// Test automation permission by sending a harmless AppleScript.
    func testAutomation() {
        permissionManager.testAutomation()
    }

    /// Open automation settings in System Preferences.
    func openAutomationSettings() {
        permissionManager.openAutomationSettings()
    }

    // MARK: - Bindings

    private func bindToEngine() {
        trackingEngine.$isTracking
            .receive(on: RunLoop.main)
            .assign(to: &$isTracking)

        trackingEngine.$currentSession
            .receive(on: RunLoop.main)
            .assign(to: &$currentSession)
    }

    private func bindToPermissions() {
        permissionManager.$isAccessibilityGranted
            .receive(on: RunLoop.main)
            .assign(to: &$isAccessibilityGranted)

        permissionManager.$isAutomationGranted
            .receive(on: RunLoop.main)
            .assign(to: &$isAutomationGranted)
    }
}
