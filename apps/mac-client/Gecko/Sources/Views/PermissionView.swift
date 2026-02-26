import SwiftUI

/// Tab 2: Permission onboarding and status dashboard.
///
/// Displays the status of required macOS permissions with clear
/// visual indicators (checkmark / xmark) and action buttons.
struct PermissionView: View {
    @ObservedObject var permissionManager: PermissionManager

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            headerSection
            Divider()
            permissionsList
            Divider()
            footerSection
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image("GeckoLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text("System Permissions")
                        .font(.title2.bold())
                    Text("Gecko needs these permissions to track your focus sessions.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.bottom, 4)

            overallStatusBadge
        }
        .padding()
    }

    private var overallStatusBadge: some View {
        HStack(spacing: 6) {
            Image(
                systemName: permissionManager.allPermissionsGranted
                    ? "checkmark.seal.fill"
                    : "exclamationmark.triangle.fill"
            )
            .foregroundStyle(permissionManager.allPermissionsGranted ? .green : .orange)
            Text(
                permissionManager.allPermissionsGranted
                    ? "All permissions granted \u{2014} Gecko is ready."
                    : "Some permissions are missing."
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(permissionManager.allPermissionsGranted ? .green : .orange)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(permissionManager.allPermissionsGranted
                      ? Color.green.opacity(0.1)
                      : Color.orange.opacity(0.1))
        )
    }

    // MARK: - Permission Rows

    private var permissionsList: some View {
        VStack(spacing: 0) {
            accessibilityRow
            Divider().padding(.leading, 52)
            permissionRow(
                title: "Automation (Apple Events)",
                subtitle: "Execute AppleScript to grab browser URLs.",
                isGranted: permissionManager.isAutomationGranted,
                requestAction: { permissionManager.testAutomation() },
                settingsAction: { permissionManager.openAutomationSettings() }
            )
        }
    }

    private var accessibilityRow: some View {
        HStack(spacing: 12) {
            Image(
                systemName: permissionManager.isAccessibilityGranted
                    ? "checkmark.circle.fill"
                    : "xmark.circle.fill"
            )
            .font(.system(size: 24))
            .foregroundStyle(permissionManager.isAccessibilityGranted ? .green : .red)
            .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text("Accessibility")
                    .font(.body.weight(.semibold))
                Text("Read window titles via AXUIElement API.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !permissionManager.isAccessibilityGranted {
                    Text(
                        "If already enabled in System Settings, click \"Reset & Request\""
                        + " \u{2014} Xcode rebuilds can invalidate the old entry."
                    )
                    .font(.caption2)
                    .foregroundStyle(.orange)
                }
            }

            Spacer()

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
            } else {
                grantedBadge
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }

    private func permissionRow(
        title: String,
        subtitle: String,
        isGranted: Bool,
        requestAction: @escaping () -> Void,
        settingsAction: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: isGranted ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 24))
                .foregroundStyle(isGranted ? .green : .red)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if !isGranted {
                Button("Request") {
                    requestAction()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)

                Button("Open Settings") {
                    settingsAction()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            } else {
                grantedBadge
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }

    private var grantedBadge: some View {
        Text("Granted")
            .font(.callout.weight(.medium))
            .foregroundStyle(.green)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.green.opacity(0.1))
            )
    }

    // MARK: - Footer

    private var footerSection: some View {
        HStack {
            Button {
                permissionManager.refreshAll()
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)

            Spacer()

            Text("Permissions are checked every 2 seconds automatically.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding()
    }
}
