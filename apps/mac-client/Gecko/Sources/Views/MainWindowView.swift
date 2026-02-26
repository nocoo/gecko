import SwiftUI

/// Main window content with a tab-based layout.
///
/// Tabs: Tracking | Permissions | Sessions | Settings | About
struct MainWindowView: View {
    @ObservedObject var permissionManager: PermissionManager
    @ObservedObject var trackingEngine: TrackingEngine
    @ObservedObject var settingsManager: SettingsManager
    @ObservedObject var tabSelection: TabSelection

    var body: some View {
        TabView(selection: $tabSelection.selectedTab) {
            TrackingStatusView(trackingEngine: trackingEngine)
                .tabItem {
                    Label(TabIdentifier.tracking.label, systemImage: TabIdentifier.tracking.icon)
                }
                .tag(TabIdentifier.tracking)

            PermissionView(permissionManager: permissionManager)
                .tabItem {
                    Label(TabIdentifier.permissions.label, systemImage: TabIdentifier.permissions.icon)
                }
                .tag(TabIdentifier.permissions)

            SessionListView(trackingEngine: trackingEngine)
                .tabItem {
                    Label(TabIdentifier.sessions.label, systemImage: TabIdentifier.sessions.icon)
                }
                .tag(TabIdentifier.sessions)

            SettingsView(settingsManager: settingsManager)
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
