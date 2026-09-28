import SwiftUI

struct MenuBarView: View {
    @ObservedObject var viewModel: MenuBarViewModel
    @ObservedObject var tabSelection: TabSelection
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        GeckoMenuContent(
            isTracking: viewModel.isTracking,
            appName: viewModel.currentAppName,
            windowTitle: viewModel.currentWindowTitle,
            permissionsGranted: viewModel.allPermissionsGranted,
            onToggle: viewModel.toggleTracking,
            onNavigate: { page in
                tabSelection.selectedTab = page
                openWindow(id: "main")
                NSApplication.shared.activate(ignoringOtherApps: true)
            },
            onQuit: viewModel.quitApp
        )
    }
}

struct GeckoMenuContent: View {
    let isTracking: Bool
    let appName: String?
    let windowTitle: String?
    let permissionsGranted: Bool
    let onToggle: () -> Void
    let onNavigate: (TabIdentifier) -> Void
    let onQuit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image("GeckoLogo").resizable().scaledToFit().frame(width: 34, height: 34)
                    .accessibilityHidden(true)
                Text("Gecko").font(.system(size: 18, weight: .semibold, design: .rounded))
                Spacer()
                GeckoBadge(
                    title: isTracking ? "Live" : "Paused", symbol: isTracking ? "record.circle" : "pause.circle",
                    color: isTracking ? GeckoTheme.accent : GeckoTheme.secondary
                )
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(isTracking ? appName ?? "Tracking active" : "Tracking paused")
                    .font(GeckoTheme.body.weight(.semibold))
                Text(isTracking ? windowTitle ?? "Waiting for your next focused window." : "Start when you’re ready.")
                    .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
                    .lineLimit(2).truncationMode(.middle)
            }
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .padding(12)
            .background(GeckoTheme.inset, in: RoundedRectangle(cornerRadius: GeckoTheme.controlRadius))

            GeckoTrackingButton(isTracking: isTracking, action: onToggle)
                .frame(maxWidth: .infinity)

            if !permissionsGranted {
                Button { onNavigate(.tracking) } label: {
                    Label("Review required permissions", systemImage: "exclamationmark.shield")
                        .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.amber)
                }
                .buttonStyle(.plain)
            }
            Divider().overlay(GeckoTheme.line)
            VStack(spacing: 4) {
                navigation("Open dashboard", page: .tracking, color: GeckoTheme.accent)
                    .keyboardShortcut("d", modifiers: .command)
                navigation("Sessions", page: .sessions, color: GeckoTheme.blue)
                navigation("Settings", page: .settings, color: GeckoTheme.amber)
                navigation("About Gecko", page: .about, color: GeckoTheme.violet)
            }
            Divider().overlay(GeckoTheme.line)
            Button(action: onQuit) {
                Label("Quit Gecko", systemImage: "power").font(GeckoTheme.detail)
            }
            .buttonStyle(.plain).foregroundStyle(GeckoTheme.secondary)
            .keyboardShortcut("q", modifiers: .command)
        }
        .padding(18)
        .frame(width: 320)
        .background(GeckoTheme.surface)
        .foregroundStyle(GeckoTheme.ink)
        .tint(GeckoTheme.accent)
    }

    private func navigation(_ title: String, page: TabIdentifier, color: Color) -> some View {
        Button { onNavigate(page) } label: {
            HStack(spacing: 10) {
                Image(systemName: page.icon).foregroundStyle(color).frame(width: 18)
                Text(title)
                Spacer()
                Image(systemName: "chevron.right").font(GeckoTheme.caption).foregroundStyle(GeckoTheme.secondary)
            }
            .font(GeckoTheme.body).padding(.vertical, 7).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
