import SwiftUI

/// Tab 1: Tracking control + collapsible permission status.
///
/// The large circular button dominates the view. A DisclosureGroup
/// at the bottom shows permission status — auto-expanded when any
/// permission is missing, collapsed when all are granted.
struct TrackingStatusView: View {
    @ObservedObject var trackingEngine: TrackingEngine
    @ObservedObject var permissionManager: PermissionManager
    @State private var permissionsExpanded = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Large circular toggle button
            trackingButton

            // Status text
            statusSection
                .padding(.top, 24)

            Spacer()

            // Collapsible permission section
            permissionDisclosure
                .padding(.horizontal)
                .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
        .onAppear {
            permissionsExpanded = !permissionManager.allPermissionsGranted
        }
        .onChange(of: permissionManager.allPermissionsGranted) { granted in
            if granted {
                withAnimation { permissionsExpanded = false }
            }
        }
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

    // MARK: - Permission Disclosure

    private var permissionDisclosure: some View {
        DisclosureGroup(isExpanded: $permissionsExpanded) {
            VStack(spacing: 0) {
                permissionRow(
                    title: "Accessibility",
                    subtitle: "Read window titles via AXUIElement API.",
                    isGranted: permissionManager.isAccessibilityGranted,
                    missingHint: permissionManager.isAccessibilityGranted ? nil
                        : "If already enabled, click \"Reset & Request\" — rebuilds can invalidate the entry.",
                    actions: {
                        if !permissionManager.isAccessibilityGranted {
                            Button("Reset & Request") {
                                permissionManager.resetAndRequestAccessibility()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)

                            Button("Open Settings") {
                                permissionManager.openAccessibilitySettings()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                )

                Divider().padding(.leading, 44)

                permissionRow(
                    title: "Automation",
                    subtitle: "Execute AppleScript to grab browser URLs.",
                    isGranted: permissionManager.isAutomationGranted,
                    missingHint: nil,
                    actions: {
                        if !permissionManager.isAutomationGranted {
                            Button("Request") {
                                permissionManager.testAutomation()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)

                            Button("Open Settings") {
                                permissionManager.openAutomationSettings()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(nsColor: .controlBackgroundColor))
            )
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } label: {
            permissionDisclosureLabel
        }
    }

    private var permissionDisclosureLabel: some View {
        HStack(spacing: 8) {
            Image(
                systemName: permissionManager.allPermissionsGranted
                    ? "checkmark.seal.fill"
                    : "exclamationmark.triangle.fill"
            )
            .foregroundStyle(permissionManager.allPermissionsGranted ? .green : .orange)

            Text(
                permissionManager.allPermissionsGranted
                    ? "All permissions granted"
                    : "Permissions required"
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(permissionManager.allPermissionsGranted ? .green : .orange)

            Spacer()
        }
    }

    // MARK: - Permission Row

    @ViewBuilder
    private func permissionRow<Actions: View>(
        title: String,
        subtitle: String,
        isGranted: Bool,
        missingHint: String?,
        @ViewBuilder actions: () -> Actions
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: isGranted ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(isGranted ? .green : .red)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.callout.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let hint = missingHint {
                    Text(hint)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }

            Spacer()

            if isGranted {
                Text("Granted")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.green)
            } else {
                actions()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
