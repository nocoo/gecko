import SwiftUI

@main
struct GeckoApp: App {
    @StateObject private var permissionManager = PermissionManager()
    @StateObject private var trackingEngine = TrackingEngine()

    var body: some Scene {
        // Main window for permission onboarding and debug dashboard
        Window("Gecko", id: "main") {
            MainWindowView(permissionManager: permissionManager, trackingEngine: trackingEngine)
        }
        .defaultSize(width: 700, height: 600)

        // About window
        Window("About Gecko", id: "about") {
            AboutView()
        }
        .windowResizability(.contentSize)
        .windowStyle(.titleBar)

        // Menu bar icon — always visible
        MenuBarExtra("Gecko", systemImage: "eye.circle") {
            MenuBarView(permissionManager: permissionManager, trackingEngine: trackingEngine)
        }
    }
}
