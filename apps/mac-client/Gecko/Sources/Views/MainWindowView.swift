import SwiftUI

struct MainWindowView: View {
    @ObservedObject var trackingViewModel: TrackingViewModel
    @ObservedObject var sessionListViewModel: SessionListViewModel
    @ObservedObject var settingsViewModel: SettingsViewModel
    @ObservedObject var tabSelection: TabSelection

    var body: some View {
        GeckoWorkspace(
            selection: $tabSelection.selectedTab,
            isTracking: trackingViewModel.isTracking,
            onToggleTracking: trackingViewModel.toggleTracking
        ) {
            switch tabSelection.selectedTab {
            case .tracking: TrackingStatusView(viewModel: trackingViewModel)
            case .sessions: SessionListView(viewModel: sessionListViewModel)
            case .settings: SettingsView(viewModel: settingsViewModel)
            case .about: AboutView()
            }
        }
    }
}

struct GeckoWorkspace<Content: View>: View {
    @Binding var selection: TabIdentifier
    let isTracking: Bool
    let onToggleTracking: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(
                    min: GeckoTheme.sidebarWidth, ideal: GeckoTheme.sidebarWidth, max: GeckoTheme.sidebarWidth
                )
        } detail: {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(GeckoTheme.canvas)
        }
        .navigationSplitViewStyle(.balanced)
        .background(GeckoTheme.canvas)
        .foregroundStyle(GeckoTheme.ink)
        .font(GeckoTheme.body)
        .tint(GeckoTheme.accent)
        .navigationTitle("Gecko")
        .frame(minWidth: GeckoTheme.minimumWidth, minHeight: GeckoTheme.minimumHeight)
        .toolbarBackground(GeckoTheme.canvas, for: .windowToolbar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                GeckoBadge(
                    title: isTracking ? "Tracking active" : "Tracking paused",
                    symbol: isTracking ? "record.circle" : "pause.circle",
                    color: isTracking ? GeckoTheme.accent : GeckoTheme.secondary
                )
            }
            ToolbarItem(placement: .primaryAction) {
                GeckoTrackingButton(isTracking: isTracking, action: onToggleTracking)
            }
        }
    }

    private var sidebar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image("GeckoLogo").resizable().scaledToFit().frame(width: 42, height: 42)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Gecko").font(.system(size: 21, weight: .semibold, design: .rounded))
                    Text("Screen time tracker").font(GeckoTheme.caption).foregroundStyle(GeckoTheme.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(16)

            VStack(alignment: .leading, spacing: 6) {
                navigationHeading("Workspace")
                navigationRow(.tracking, color: GeckoTheme.accent)
                navigationRow(.sessions, color: GeckoTheme.blue)
                navigationHeading("Application").padding(.top, 18)
                navigationRow(.settings, color: GeckoTheme.amber)
                navigationRow(.about, color: GeckoTheme.violet)
            }
            .padding(.horizontal, 12)
            Spacer(minLength: 20)

            VStack(alignment: .leading, spacing: 8) {
                Label("Made for your time", systemImage: "leaf")
                    .font(GeckoTheme.detail.weight(.medium))
                    .foregroundStyle(GeckoTheme.accent)
                Text("Sessions stay on this Mac.\nSync on your terms.")
                    .font(GeckoTheme.caption)
                    .foregroundStyle(GeckoTheme.secondary)
                    .lineSpacing(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(GeckoTheme.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: GeckoTheme.radius))
            .padding(12)
        }
        .background(GeckoTheme.sidebar)
    }

    private func navigationHeading(_ title: String) -> some View {
        Text(title.uppercased()).font(GeckoTheme.caption.weight(.medium)).tracking(1)
            .foregroundStyle(GeckoTheme.secondary).padding(.horizontal, 10).padding(.bottom, 4)
    }

    private func navigationRow(_ page: TabIdentifier, color: Color) -> some View {
        Button { selection = page } label: {
            HStack(spacing: 10) {
                Image(systemName: page.icon).font(.system(size: 15, weight: .medium))
                    .foregroundStyle(color).frame(width: 22)
                Text(page.label).font(GeckoTheme.body.weight(selection == page ? .semibold : .regular))
                Spacer(minLength: 0)
                if selection == page {
                    Circle().fill(GeckoTheme.accent).frame(width: 5, height: 5).accessibilityHidden(true)
                }
            }
            .foregroundStyle(selection == page ? GeckoTheme.accent : GeckoTheme.ink)
            .padding(.horizontal, 10).frame(height: 38)
            .background(selection == page ? GeckoTheme.accentWash : .clear,
                        in: RoundedRectangle(cornerRadius: GeckoTheme.controlRadius))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(KeyEquivalent(Character(String(page.rawValue + 1))), modifiers: .command)
        .accessibilityAddTraits(selection == page ? .isSelected : [])
        .accessibilityIdentifier("navigation.\(page.label.lowercased())")
    }
}
