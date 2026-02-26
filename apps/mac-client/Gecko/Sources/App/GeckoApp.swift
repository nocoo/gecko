import SwiftUI

@main
struct GeckoApp: App {
    @StateObject private var permissionManager = PermissionManager()
    @StateObject private var trackingEngine = TrackingEngine()
    @StateObject private var settingsManager = SettingsManager()
    @StateObject private var tabSelection = TabSelection()

    var body: some Scene {
        // Main window with tabbed layout
        Window("Gecko", id: "main") {
            MainWindowView(
                permissionManager: permissionManager,
                trackingEngine: trackingEngine,
                settingsManager: settingsManager,
                tabSelection: tabSelection
            )
        }
        .defaultSize(width: 700, height: 600)

        // Menu bar icon — always visible
        MenuBarExtra("Gecko", systemImage: "eye.circle") {
            MenuBarView(
                permissionManager: permissionManager,
                trackingEngine: trackingEngine,
                tabSelection: tabSelection
            )
        }
    }
}
