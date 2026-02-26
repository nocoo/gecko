import SwiftUI

/// Main window content that combines permission onboarding and debug session list.
struct MainWindowView: View {
    @ObservedObject var permissionManager: PermissionManager
    @ObservedObject var trackingEngine: TrackingEngine

    var body: some View {
        VStack(spacing: 0) {
            PermissionView(permissionManager: permissionManager)

            Divider()

            // Tracking controls
            trackingControls

            Divider()

            // Session debug list
            SessionListView(trackingEngine: trackingEngine)
        }
        .frame(minWidth: 600, idealWidth: 700, minHeight: 500, idealHeight: 600)
    }

    private var trackingControls: some View {
        HStack {
            Circle()
                .fill(trackingEngine.isTracking ? Color.green : Color.red.opacity(0.5))
                .frame(width: 10, height: 10)

            Text(trackingEngine.isTracking ? "Tracking" : "Stopped")
                .font(.callout.weight(.medium))

            if let session = trackingEngine.currentSession {
                Text("—")
                    .foregroundStyle(.tertiary)
                Text(session.appName)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Button(trackingEngine.isTracking ? "Stop" : "Start") {
                if trackingEngine.isTracking {
                    trackingEngine.stop()
                } else {
                    trackingEngine.start()
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(trackingEngine.isTracking ? .red : .green)
            .controlSize(.small)
        }
        .padding()
    }
}
