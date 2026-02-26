import SwiftUI

/// Main window content with a tab-based layout.
///
/// Tabs: Tracking | Sessions | Settings | About
struct MainWindowView: View {
    @ObservedObject var trackingViewModel: TrackingViewModel
    @ObservedObject var sessionListViewModel: SessionListViewModel
    @ObservedObject var settingsViewModel: SettingsViewModel
    @ObservedObject var tabSelection: TabSelection

    var body: some View {
        TabView(selection: $tabSelection.selectedTab) {
            TrackingStatusView(viewModel: trackingViewModel)
                .tabItem {
                    Label(TabIdentifier.tracking.label, systemImage: TabIdentifier.tracking.icon)
                }
                .tag(TabIdentifier.tracking)

            SessionListView(viewModel: sessionListViewModel)
                .tabItem {
                    Label(TabIdentifier.sessions.label, systemImage: TabIdentifier.sessions.icon)
                }
                .tag(TabIdentifier.sessions)

            SettingsView(viewModel: settingsViewModel)
                .tabItem {
                    Label(TabIdentifier.settings.label, systemImage: TabIdentifier.settings.icon)
                }
                .tag(TabIdentifier.settings)

            AboutView()
                .tabItem {
                    Label(TabIdentifier.about.label, systemImage: TabIdentifier.about.icon)
                }
                .tag(TabIdentifier.about)
        }
        .frame(minWidth: 600, idealWidth: 700, minHeight: 500, idealHeight: 600)
    }
}
