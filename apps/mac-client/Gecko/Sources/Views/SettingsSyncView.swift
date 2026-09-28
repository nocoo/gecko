import SwiftUI

struct SettingsSyncView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        GeckoCard {
            HStack(spacing: 10) {
                GeckoSymbol(symbol: "icloud", color: GeckoTheme.blue, size: 32)
                Text("Cloud sync").font(GeckoTheme.heading)
                Spacer()
            }

            Text("Sync focus sessions to your Gecko dashboard.")
                .font(GeckoTheme.detail)
                .foregroundStyle(GeckoTheme.secondary)

            // Enable toggle
            Toggle("Enable sync", isOn: $viewModel.syncEnabled)
                .toggleStyle(.switch)

            // API Key
            VStack(alignment: .leading, spacing: 4) {
                Text("API Key")
                    .font(GeckoTheme.detail.weight(.medium))
                SecureField("Paste your API key (gk_...)", text: $viewModel.editingApiKey)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .accessibilityLabel("API key")
            }

            // Server URL
            VStack(alignment: .leading, spacing: 4) {
                Text("Server URL")
                    .font(GeckoTheme.detail.weight(.medium))
                TextField("https://gecko.dev.hexly.ai", text: $viewModel.editingSyncServerUrl)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .onChange(of: viewModel.editingSyncServerUrl) {
                        viewModel.syncUrlValidationError = nil
                    }
                if let error = viewModel.syncUrlValidationError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(GeckoTheme.detail)
                        .foregroundStyle(GeckoTheme.danger)
                }
            }

            // Sync status
            syncStatusView

            // Actions
            HStack(spacing: 12) {
                Button {
                    viewModel.saveSyncSettings()
                } label: {
                    Label("Save connection", systemImage: "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .tint(GeckoTheme.action)
                .controlSize(.small)
                .disabled(!viewModel.canSaveSyncSettings)
                .accessibilityLabel("Save sync settings")

                Button {
                    Task { await viewModel.syncNow() }
                } label: {
                    Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!viewModel.canSyncNow)
                .accessibilityHint("Triggers an immediate sync of pending sessions")

                Button("Reset connection") {
                    viewModel.resetSyncSettings()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!viewModel.canResetSyncSettings)
                .accessibilityLabel("Reset sync settings")
            }
        }
    }

    // MARK: - Sync Status View

    @ViewBuilder
    private var syncStatusView: some View {
        HStack(spacing: 8) {
            syncStatusIcon
            syncStatusText
        }
        .font(GeckoTheme.detail)
    }

    @ViewBuilder
    private var syncStatusIcon: some View {
        switch viewModel.syncStatus {
        case .idle:
            if let lastErr = viewModel.syncLastError, !lastErr.isEmpty {
                // Cycle finished but a batch failed — red icon mirrors the
                // red text below.
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(GeckoTheme.danger)
                    .accessibilityLabel("Last sync had failures")
            } else {
                Image(systemName: "checkmark.circle")
                    .foregroundStyle(GeckoTheme.accent)
                    .accessibilityLabel("Sync idle")
            }
        case .syncing:
            ProgressView()
                .controlSize(.small)
                .accessibilityLabel("Syncing")
        case .error:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(GeckoTheme.danger)
                .accessibilityLabel("Sync error")
        case .disabled:
            Image(systemName: "minus.circle")
                .foregroundStyle(GeckoTheme.secondary)
                .accessibilityLabel("Sync disabled")
        }
    }

    @ViewBuilder
    private var syncStatusText: some View {
        let pending = viewModel.syncPendingCount
        let progress = viewModel.syncCycleProgress
        let lastErr = viewModel.syncLastError
        switch viewModel.syncStatus {
        case .idle:
            if let lastErr, !lastErr.isEmpty {
                Text("\(lastErr) — \(pending) still pending")
                    .foregroundStyle(GeckoTheme.danger)
            } else if pending > 0 {
                Text("\(pending) pending — next cycle in <5 min")
                    .foregroundStyle(GeckoTheme.secondary)
            } else if let lastTime = viewModel.syncLastTime {
                Text("Last synced: \(lastTime, style: .relative) ago (\(viewModel.syncLastCount) sessions)")
                    .foregroundStyle(GeckoTheme.secondary)
            } else {
                Text("Ready to sync")
                    .foregroundStyle(GeckoTheme.secondary)
            }
        case .syncing:
            if pending + progress > 0 {
                Text("Syncing… \(progress) of \(progress + pending)")
                    .foregroundStyle(GeckoTheme.secondary)
            } else {
                Text("Syncing…")
                    .foregroundStyle(GeckoTheme.secondary)
            }
        case .error(let message):
            if pending > 0 {
                Text("\(message) — \(pending) still pending")
                    .foregroundStyle(GeckoTheme.danger)
            } else {
                Text(message)
                    .foregroundStyle(GeckoTheme.danger)
            }
        case .disabled:
            Text("Sync disabled")
                .foregroundStyle(GeckoTheme.secondary)
        }
    }
}
