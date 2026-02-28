import SwiftUI
import Combine

@main
struct GeckoApp: App {
    // MARK: - Services (internal, not passed to views directly)
    @StateObject private var permissionManager = PermissionManager()
    @StateObject private var trackingEngine = TrackingEngine()
    @StateObject private var settingsManager = SettingsManager()
    @StateObject private var tabSelection = TabSelection()
    @StateObject private var syncService: SyncService

    // MARK: - ViewModels
    @StateObject private var trackingViewModel: TrackingViewModel
    @StateObject private var menuBarViewModel: MenuBarViewModel
    @StateObject private var sessionListViewModel: SessionListViewModel
    @StateObject private var settingsViewModel: SettingsViewModel

    init() {
        let permission = PermissionManager()
        let engine = TrackingEngine()
        let settings = SettingsManager()
        let tab = TabSelection()

        let sync = SyncService(db: DatabaseManager.shared, settings: settings)

        _permissionManager = StateObject(wrappedValue: permission)
        _trackingEngine = StateObject(wrappedValue: engine)
        _settingsManager = StateObject(wrappedValue: settings)
        _tabSelection = StateObject(wrappedValue: tab)
        _syncService = StateObject(wrappedValue: sync)

        _trackingViewModel = StateObject(
            wrappedValue: TrackingViewModel(
                trackingEngine: engine,
                permissionManager: permission
            )
        )
        _menuBarViewModel = StateObject(
            wrappedValue: MenuBarViewModel(
                trackingEngine: engine,
                permissionManager: permission
            )
        )
        _sessionListViewModel = StateObject(
            wrappedValue: SessionListViewModel(db: DatabaseManager.shared)
        )
        _settingsViewModel = StateObject(
            wrappedValue: SettingsViewModel(settingsManager: settings, syncService: sync)
        )
    }

    var body: some Scene {
        // Main window with tabbed layout
        Window("Gecko", id: "main") {
            MainWindowView(
                trackingViewModel: trackingViewModel,
                sessionListViewModel: sessionListViewModel,
                settingsViewModel: settingsViewModel,
                tabSelection: tabSelection
            )
            .task {
                await autoStartTrackingIfNeeded()
            }
        }
        .defaultSize(width: 700, height: 600)

        // Menu bar icon — always visible
        MenuBarExtra("Gecko", systemImage: "eye.circle") {
            MenuBarView(
                viewModel: menuBarViewModel,
                tabSelection: tabSelection
            )
        }
    }

    // MARK: - Auto-Start

    /// If the user enabled "auto-start tracking", wait for permissions then start.
    @MainActor
    private func autoStartTrackingIfNeeded() async {
        guard settingsManager.autoStartTracking else { return }
        guard !trackingEngine.isTracking else { return }

        // Permissions are polled asynchronously — wait up to ~6 s for them.
        for _ in 0..<6 {
            if permissionManager.allPermissionsGranted {
                trackingEngine.start()
                return
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }
}
