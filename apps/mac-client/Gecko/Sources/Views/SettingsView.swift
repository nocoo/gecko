import SwiftUI

/// Tab 4: Settings for configuring database path and cloud sync.
struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                headerSection
                Divider()
                generalSection
                Divider()
                    .padding(.horizontal)
                databasePathSection
                Divider()
                    .padding(.horizontal)
                syncSection
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 10) {
            Image(systemName: "gearshape.fill")
                .font(.system(size: 24))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Settings")
                    .font(.title2.bold())
                Text("Configure Gecko preferences.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    // MARK: - General

    private var generalSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("General", systemImage: "switch.2")
                .font(.headline)

            Toggle("Auto-start tracking on launch", isOn: $viewModel.autoStartTracking)
                .toggleStyle(.switch)

            Text("When enabled, tracking starts automatically if permissions are granted.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    // MARK: - Database Path

    private var databasePathSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Database Location", systemImage: "externaldrive.fill")
                .font(.headline)

            Text("The SQLite file where focus sessions are stored.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                TextField("Database path", text: $viewModel.editingPath)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .onChange(of: viewModel.editingPath) {
                        viewModel.onPathChanged()
                    }

                Button("Browse...") {
                    browseForPath()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Browse for database file")
                .accessibilityHint("Opens a file browser to choose the database location")
            }

            if viewModel.showValidationError {
                Label(
                    "Invalid path. The parent directory must exist or be creatable.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption)
                .foregroundStyle(.red)
            }

            HStack(spacing: 12) {
                Button("Save") {
                    viewModel.save()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(!viewModel.canSave)
                .accessibilityLabel("Save database path")

                Button("Reset to Default") {
                    viewModel.resetToDefault()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!viewModel.canReset)
                .accessibilityLabel("Reset database path to default")

                Spacer()

                if viewModel.isCustomPath {
                    Label("Custom path", systemImage: "info.circle")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                } else {
                    Label("Default path", systemImage: "checkmark.circle")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
            }
        }
        .padding()
    }

    // MARK: - Cloud Sync

    private var syncSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Cloud Sync", systemImage: "icloud.fill")
                .font(.headline)

            Text("Sync focus sessions to your Gecko dashboard.")
                .font(.caption)
                .foregroundStyle(.secondary)

            // Enable toggle
            Toggle("Enable sync", isOn: $viewModel.syncEnabled)
                .toggleStyle(.switch)

            // API Key
            VStack(alignment: .leading, spacing: 4) {
                Text("API Key")
                    .font(.subheadline.weight(.medium))
                SecureField("Paste your API key (gk_...)", text: $viewModel.editingApiKey)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .accessibilityLabel("API key")
            }

            // Server URL
            VStack(alignment: .leading, spacing: 4) {
                Text("Server URL")
                    .font(.subheadline.weight(.medium))
                TextField("https://gecko.dev.hexly.ai", text: $viewModel.editingSyncServerUrl)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .onChange(of: viewModel.editingSyncServerUrl) {
                        viewModel.syncUrlValidationError = nil
                    }
                if let error = viewModel.syncUrlValidationError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            // Sync status
            syncStatusView

            // Actions
            HStack(spacing: 12) {
                Button("Save") {
                    viewModel.saveSyncSettings()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(!viewModel.canSaveSyncSettings)
                .accessibilityLabel("Save sync settings")

                Button("Sync Now") {
                    Task { await viewModel.syncNow() }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!viewModel.canSyncNow)
                .accessibilityHint("Triggers an immediate sync of pending sessions")

                Button("Reset") {
                    viewModel.resetSyncSettings()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Reset sync settings")
            }
        }
        .padding()
    }

    // MARK: - Sync Status View

    @ViewBuilder
    private var syncStatusView: some View {
        HStack(spacing: 8) {
            syncStatusIcon
            syncStatusText
        }
        .font(.caption)
    }

    @ViewBuilder
    private var syncStatusIcon: some View {
        switch viewModel.syncStatus {
        case .idle:
            Image(systemName: "checkmark.circle")
                .foregroundStyle(.green)
                .accessibilityLabel("Sync idle")
        case .syncing:
            ProgressView()
                .controlSize(.small)
                .accessibilityLabel("Syncing")
        case .error:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .accessibilityLabel("Sync error")
        case .disabled:
            Image(systemName: "minus.circle")
                .foregroundStyle(.secondary)
                .accessibilityLabel("Sync disabled")
        }
    }

    @ViewBuilder
    private var syncStatusText: some View {
        switch viewModel.syncStatus {
        case .idle:
            if let lastTime = viewModel.syncLastTime {
                Text("Last synced: \(lastTime, style: .relative) ago (\(viewModel.syncLastCount) sessions)")
                    .foregroundStyle(.secondary)
            } else {
                Text("Ready to sync")
                    .foregroundStyle(.secondary)
            }
        case .syncing:
            Text("Syncing...")
                .foregroundStyle(.secondary)
        case .error(let message):
            Text(message)
                .foregroundStyle(.red)
        case .disabled:
            Text("Sync disabled")
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - File Browser

    private func browseForPath() {
        let panel = NSSavePanel()
        panel.title = "Choose Database Location"
        panel.nameFieldStringValue = "gecko.sqlite"
        panel.allowedContentTypes = [.database]
        panel.canCreateDirectories = true

        if panel.runModal() == .OK, let url = panel.url {
            viewModel.setPath(url.path)
        }
    }
}
