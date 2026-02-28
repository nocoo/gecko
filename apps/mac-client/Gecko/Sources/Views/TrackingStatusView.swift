import SwiftUI

/// Tab 1: Tracking control + collapsible permission status.
///
/// The large circular button dominates the view. A DisclosureGroup
/// at the bottom shows permission status — auto-expanded when any
/// permission is missing, collapsed when all are granted.
struct TrackingStatusView: View {
    @ObservedObject var viewModel: TrackingViewModel
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
            permissionsExpanded = !viewModel.allPermissionsGranted
        }
        .onChange(of: viewModel.allPermissionsGranted) {
            if viewModel.allPermissionsGranted {
                withAnimation { permissionsExpanded = false }
            }
        }
    }

    // MARK: - Tracking Button

    private var trackingButton: some View {
        Button {
            viewModel.toggleTracking()
        } label: {
            ZStack {
                // Outer glow ring
                Circle()
                    .fill(
                        viewModel.isTracking
                            ? Color.green.opacity(0.15)
                            : Color.secondary.opacity(0.08)
                    )
                    .frame(width: 160, height: 160)

                // Main circle
                Circle()
                    .fill(
                        viewModel.isTracking
                            ? Color.green.gradient
                            : Color.secondary.opacity(0.2).gradient
                    )
                    .frame(width: 120, height: 120)
                    .shadow(
                        color: viewModel.isTracking
                            ? Color.green.opacity(0.4)
                            : Color.clear,
                        radius: 12
                    )

                // Icon
                Image(systemName: viewModel.isTracking ? "eye.fill" : "eye.slash")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(viewModel.isTracking ? .white : .secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(viewModel.isTracking ? "Stop Tracking" : "Start Tracking")
        .accessibilityHint("Double-click to toggle focus tracking")
    }

    // MARK: - Status Section

    private var statusSection: some View {
        VStack(spacing: 8) {
            Text(viewModel.isTracking ? "Tracking Active" : "Tracking Paused")
                .font(.title2.bold())

            if viewModel.isTracking, let session = viewModel.currentSession {
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
                        if let parsedURL = URL(string: url) {
                            Link(url, destination: parsedURL)
                                .font(.caption2)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        } else {
                            Text(url)
                                .font(.caption2)
                                .foregroundStyle(.blue)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                }
            } else if !viewModel.isTracking {
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
                    isGranted: viewModel.isAccessibilityGranted,
                    missingHint: viewModel.isAccessibilityGranted ? nil
                        : "If already enabled, click \"Reset & Request\" — rebuilds can invalidate the entry.",
                    actions: {
                        if !viewModel.isAccessibilityGranted {
                            Button("Reset & Request") {
                                viewModel.resetAndRequestAccessibility()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)

                            Button("Open Settings") {
                                viewModel.openAccessibilitySettings()
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
                    isGranted: viewModel.isAutomationGranted,
                    missingHint: nil,
                    actions: {
                        if !viewModel.isAutomationGranted {
                            Button("Request") {
                                viewModel.testAutomation()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)

                            Button("Open Settings") {
                                viewModel.openAutomationSettings()
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
                systemName: viewModel.allPermissionsGranted
                    ? "checkmark.seal.fill"
                    : "exclamationmark.triangle.fill"
            )
            .foregroundStyle(viewModel.allPermissionsGranted ? .green : .orange)
            .accessibilityHidden(true)

            Text(
                viewModel.allPermissionsGranted
                    ? "All permissions granted"
                    : "Permissions required"
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(viewModel.allPermissionsGranted ? .green : .orange)

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
                .accessibilityLabel(isGranted ? "\(title) granted" : "\(title) not granted")

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
