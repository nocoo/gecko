import SwiftUI

/// Tab 1: Large circular button to start/stop tracking with status display.
struct TrackingStatusView: View {
    @ObservedObject var trackingEngine: TrackingEngine

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Large circular toggle button
            trackingButton

            // Status text
            statusSection

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: - Tracking Button

    private var trackingButton: some View {
        Button {
            if trackingEngine.isTracking {
                trackingEngine.stop()
            } else {
                trackingEngine.start()
            }
        } label: {
            ZStack {
                // Outer glow ring
                Circle()
                    .fill(
                        trackingEngine.isTracking
                            ? Color.green.opacity(0.15)
                            : Color.secondary.opacity(0.08)
                    )
                    .frame(width: 160, height: 160)

                // Main circle
                Circle()
                    .fill(
                        trackingEngine.isTracking
                            ? Color.green.gradient
                            : Color.secondary.opacity(0.2).gradient
                    )
                    .frame(width: 120, height: 120)
                    .shadow(
                        color: trackingEngine.isTracking
                            ? Color.green.opacity(0.4)
                            : Color.clear,
                        radius: 12
                    )

                // Icon
                Image(systemName: trackingEngine.isTracking ? "eye.fill" : "eye.slash")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(trackingEngine.isTracking ? .white : .secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(trackingEngine.isTracking ? "Stop Tracking" : "Start Tracking")
        .accessibilityHint("Double-click to toggle focus tracking")
    }

    // MARK: - Status Section

    private var statusSection: some View {
        VStack(spacing: 8) {
            Text(trackingEngine.isTracking ? "Tracking Active" : "Tracking Paused")
                .font(.title2.bold())

            if trackingEngine.isTracking, let session = trackingEngine.currentSession {
                VStack(spacing: 4) {
                    Text(session.appName)
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Text(session.windowTitle)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if let url = session.url, !url.isEmpty {
                        Text(url)
                            .font(.caption2)
                            .foregroundStyle(.blue)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            } else if !trackingEngine.isTracking {
                Text("Click the button to start tracking your focus sessions.")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}
