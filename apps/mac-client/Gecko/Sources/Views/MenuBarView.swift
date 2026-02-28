import SwiftUI

/// Menu bar dropdown content.
struct MenuBarView: View {
    @ObservedObject var viewModel: MenuBarViewModel
    @ObservedObject var tabSelection: TabSelection
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 4) {
            // Tracking status
            if viewModel.isTracking {
                if let appName = viewModel.currentAppName {
                    Label(appName, systemImage: "eye.fill")
                        .padding(.vertical, 4)
                    if let windowTitle = viewModel.currentWindowTitle {
                        Text(windowTitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                } else {
                    Label("Tracking Active", systemImage: "eye.fill")
                        .padding(.vertical, 4)
                }
            } else {
                Label("Tracking Paused", systemImage: "eye.slash")
                    .padding(.vertical, 4)
            }

            // Permission warning
            if !viewModel.allPermissionsGranted {
                Divider()
                Label("Permissions Missing", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }

            Divider()

            // Toggle tracking
            Button(viewModel.toggleButtonTitle) {
                viewModel.toggleTracking()
            }
            .accessibilityHint(viewModel.isTracking ? "Pauses focus tracking" : "Resumes focus tracking")

            // Open main window
            Button("Open Dashboard") {
                openWindow(id: "main")
                NSApplication.shared.activate(ignoringOtherApps: true)
            }
            .keyboardShortcut("d", modifiers: .command)
            .accessibilityHint("Opens the main Gecko window")

            Button("About Gecko") {
                tabSelection.selectedTab = .about
                openWindow(id: "main")
                NSApplication.shared.activate(ignoringOtherApps: true)
            }

            Divider()

            Button("Quit Gecko") {
                viewModel.quitApp()
            }
            .keyboardShortcut("q", modifiers: .command)
            .accessibilityHint("Terminates the Gecko application")
        }
        .padding(4)
    }
}
