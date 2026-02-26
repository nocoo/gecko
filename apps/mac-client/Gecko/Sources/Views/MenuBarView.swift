import SwiftUI

/// Menu bar dropdown content.
struct MenuBarView: View {
    @ObservedObject var permissionManager: PermissionManager

    var body: some View {
        VStack(spacing: 4) {
            // Permission status summary
            Label(
                permissionManager.allPermissionsGranted ? "Tracking Active" : "Permissions Missing",
                systemImage: permissionManager.allPermissionsGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
            )
            .padding(.vertical, 4)

            Divider()

            // Quick action: open main window
            Button("Open Dashboard") {
                openMainWindow()
            }
            .keyboardShortcut("d", modifiers: .command)

            Divider()

            Button("Quit Gecko") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        }
        .padding(4)
    }

    private func openMainWindow() {
        // Activate the app and bring the main window to front
        NSApplication.shared.activate(ignoringOtherApps: true)
        if let window = NSApplication.shared.windows.first(where: { $0.title == "Gecko" }) {
            window.makeKeyAndOrderFront(nil)
        } else {
            // Use OpenWindowAction via environment if available
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
    }
}
