import SwiftUI

/// Main window content that combines permission onboarding and debug session list.
struct MainWindowView: View {
    @ObservedObject var permissionManager: PermissionManager

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                PermissionView(permissionManager: permissionManager)

                Divider()

                // Placeholder for the debug session list (Task 2)
                debugPlaceholder
            }
        }
        .frame(minWidth: 600, idealWidth: 700, minHeight: 500, idealHeight: 600)
    }

    private var debugPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)
            Text("Focus Sessions")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("Session tracking will appear here once the tracking engine is implemented.")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}
