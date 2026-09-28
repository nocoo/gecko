import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        GeometryReader { geometry in
            let layout = geometry.size.width >= 840
                ? AnyLayout(HStackLayout(alignment: .top, spacing: GeckoTheme.sectionGap))
                : AnyLayout(VStackLayout(spacing: GeckoTheme.sectionGap))
            ScrollView {
                VStack(alignment: .leading, spacing: GeckoTheme.sectionGap) {
                    GeckoPageHeader(
                        title: "Settings", subtitle: "Make Gecko fit the way you work.", symbol: "slider.horizontal.3",
                        color: GeckoTheme.amber
                    )
                    layout {
                        generalSection
                        databaseSection
                    }
                    SettingsSyncView(viewModel: viewModel)
                }
                .padding(GeckoTheme.pageInset)
                .frame(maxWidth: 920, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
        .background(GeckoTheme.canvas)
        .foregroundStyle(GeckoTheme.ink)
        .font(GeckoTheme.body)
        .tint(GeckoTheme.accent)
    }

    private var generalSection: some View {
        GeckoCard {
            sectionTitle("Everyday", symbol: "sun.max", color: GeckoTheme.amber)
            Toggle(isOn: Binding(
                get: { viewModel.launchAtLogin },
                set: { viewModel.launchAtLogin = $0 }
            )) {
                settingLabel("Launch at login", detail: "Keep Gecko ready when you sign in to your Mac.")
            }
            .toggleStyle(.switch)
            Divider().overlay(GeckoTheme.line)
            Toggle(isOn: $viewModel.autoStartTracking) {
                settingLabel("Start tracking automatically", detail: "Begin on launch once the required permissions are granted.")
            }
            .toggleStyle(.switch)
        }
    }

    private var databaseSection: some View {
        GeckoCard {
            sectionTitle("Local storage", symbol: "internaldrive", color: GeckoTheme.violet)
            GeckoBadge(
                title: viewModel.isCustomPath ? "Custom location" : "Default location",
                symbol: viewModel.isCustomPath ? "folder" : "checkmark.circle",
                color: viewModel.isCustomPath ? GeckoTheme.amber : GeckoTheme.accent
            )
            Text("Your focus sessions are saved in a local SQLite database.")
                .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
            HStack(spacing: 10) {
                Text(viewModel.editingPath)
                    .font(GeckoTheme.detail.monospaced())
                    .lineLimit(2).truncationMode(.middle).textSelection(.enabled)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(GeckoTheme.inset, in: RoundedRectangle(cornerRadius: GeckoTheme.controlRadius))
                    .accessibilityLabel("Database file path")
                    .help(viewModel.editingPath)
                Button(action: browseForPath) { Label("Browse…", systemImage: "folder") }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Browse for database file")
            }
            if viewModel.showValidationError {
                Label("The parent directory must exist or be creatable.", systemImage: "exclamationmark.triangle.fill")
                    .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.danger)
            }
            HStack(spacing: 10) {
                Button { viewModel.save() } label: { Label("Save location", systemImage: "checkmark") }
                    .buttonStyle(.borderedProminent).tint(GeckoTheme.action)
                    .disabled(!viewModel.canSave)
                Button("Reset to default") { viewModel.resetToDefault() }
                    .buttonStyle(.bordered).disabled(!viewModel.canReset)
            }
            .controlSize(.small)
        }
    }

    private func sectionTitle(_ title: String, symbol: String, color: Color) -> some View {
        HStack(spacing: 10) {
            GeckoSymbol(symbol: symbol, color: color, size: 32)
            Text(title).font(GeckoTheme.heading)
        }
    }

    private func settingLabel(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(GeckoTheme.body.weight(.medium))
            Text(detail).font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func browseForPath() {
        let panel = NSSavePanel()
        panel.title = "Choose Database Location"
        panel.nameFieldStringValue = "gecko.sqlite"
        panel.allowedContentTypes = [.database]
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url { viewModel.setPath(url.path) }
    }
}
