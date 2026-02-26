import SwiftUI

/// Tab 4: Settings for configuring the SQLite database path.
struct SettingsView: View {
    @ObservedObject var settingsManager: SettingsManager
    @State private var editingPath: String = ""
    @State private var showValidationError: Bool = false
    @State private var isEditing: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            headerSection
            Divider()
            databasePathSection
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            editingPath = settingsManager.databasePath
        }
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

    // MARK: - Database Path

    private var databasePathSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Database Location", systemImage: "externaldrive.fill")
                .font(.headline)

            Text("The SQLite file where focus sessions are stored.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                TextField("Database path", text: $editingPath)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .onChange(of: editingPath) {
                        isEditing = (editingPath != settingsManager.databasePath)
                        showValidationError = false
                    }

                Button("Browse...") {
                    browseForPath()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            if showValidationError {
                Label("Invalid path. The parent directory must exist or be creatable.", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack(spacing: 12) {
                Button("Save") {
                    if settingsManager.validatePath(editingPath) {
                        settingsManager.databasePath = editingPath
                        isEditing = false
                        showValidationError = false
                    } else {
                        showValidationError = true
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(!isEditing)

                Button("Reset to Default") {
                    settingsManager.resetToDefault()
                    editingPath = settingsManager.databasePath
                    isEditing = false
                    showValidationError = false
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!settingsManager.isCustomPath && !isEditing)

                Spacer()

                if settingsManager.isCustomPath {
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

    // MARK: - File Browser

    private func browseForPath() {
        let panel = NSSavePanel()
        panel.title = "Choose Database Location"
        panel.nameFieldStringValue = "gecko.sqlite"
        panel.allowedContentTypes = [.database]
        panel.canCreateDirectories = true

        if panel.runModal() == .OK, let url = panel.url {
            editingPath = url.path
        }
    }
}
