import SwiftUI

@main
struct GeckoApp: App {
    @StateObject private var permissionManager = PermissionManager()

    var body: some Scene {
        // Main window for permission onboarding and debug dashboard
        Window("Gecko", id: "main") {
            MainWindowView(permissionManager: permissionManager)
        }
        .defaultSize(width: 700, height: 600)

        // Menu bar icon — always visible
        MenuBarExtra("Gecko", systemImage: "eye.circle") {
            MenuBarView(permissionManager: permissionManager)
        }
    }
}
