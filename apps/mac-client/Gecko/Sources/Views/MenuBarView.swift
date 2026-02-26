import SwiftUI

/// Menu bar dropdown content.
struct MenuBarView: View {
    @ObservedObject var permissionManager: PermissionManager
    @ObservedObject var trackingEngine: TrackingEngine
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 4) {
            // Tracking status
            if trackingEngine.isTracking {
                if let session = trackingEngine.currentSession {
                    Label(session.appName, systemImage: "eye.fill")
                        .padding(.vertical, 4)
                    Text(session.windowTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Label("Tracking Active", systemImage: "eye.fill")
                        .padding(.vertical, 4)
                }
            } else {
                Label("Tracking Paused", systemImage: "eye.slash")
                    .padding(.vertical, 4)
            }

            // Permission warning
            if !permissionManager.allPermissionsGranted {
                Divider()
                Label("Permissions Missing", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }

            Divider()

            // Toggle tracking
            Button(trackingEngine.isTracking ? "Stop Tracking" : "Start Tracking") {
                if trackingEngine.isTracking {
                    trackingEngine.stop()
                } else {
                    trackingEngine.start()
                }
            }

            // Open main window
            Button("Open Dashboard") {
                openWindow(id: "main")
                NSApplication.shared.activate(ignoringOtherApps: true)
            }
            .keyboardShortcut("d", modifiers: .command)

            Divider()

            Button("Quit Gecko") {
                trackingEngine.stop()
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        }
        .padding(4)
    }
}
