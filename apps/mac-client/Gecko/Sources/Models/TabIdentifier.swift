import Foundation

/// Identifies which tab is currently selected in the main window.
///
/// Shared between TabContainerView and MenuBarView so that
/// "About Gecko" in the menu bar can switch to the About tab.
enum TabIdentifier: Int, CaseIterable, Identifiable {
    case tracking = 0
    case permissions = 1
    case sessions = 2
    case settings = 3
    case about = 4

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .tracking:    return "Tracking"
        case .permissions: return "Permissions"
        case .sessions:    return "Sessions"
        case .settings:    return "Settings"
        case .about:       return "About"
        }
    }

    var icon: String {
        switch self {
        case .tracking:    return "eye.circle"
        case .permissions: return "lock.shield"
        case .sessions:    return "clock.arrow.circlepath"
        case .settings:    return "gearshape"
        case .about:       return "info.circle"
        }
    }
}

/// Observable object for sharing tab selection across the app.
@MainActor
final class TabSelection: ObservableObject {
    @Published var selectedTab: TabIdentifier = .tracking
}
