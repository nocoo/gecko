import SwiftUI

@main
struct GeckoApp: App {
    // MARK: - Services (internal, not passed to views directly)
    @StateObject private var permissionManager = PermissionManager()
    @StateObject private var trackingEngine = TrackingEngine()
    @StateObject private var settingsManager = SettingsManager()
    @StateObject private var tabSelection = TabSelection()

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

        _permissionManager = StateObject(wrappedValue: permission)
        _trackingEngine = StateObject(wrappedValue: engine)
        _settingsManager = StateObject(wrappedValue: settings)
        _tabSelection = StateObject(wrappedValue: tab)

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
            wrappedValue: SettingsViewModel(settingsManager: settings)
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
}
