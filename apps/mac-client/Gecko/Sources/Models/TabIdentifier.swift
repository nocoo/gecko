import Foundation

/// Identifies which tab is currently selected in the main window.
///
/// Shared between TabContainerView and MenuBarView so that
/// "About Gecko" in the menu bar can switch to the About tab.
enum TabIdentifier: Int, CaseIterable, Identifiable {
    case tracking = 0
    case sessions = 1
    case settings = 2
    case about = 3

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .tracking: return "Tracking"
        case .sessions: return "Sessions"
        case .settings: return "Settings"
        case .about:    return "About"
        }
    }

    var icon: String {
        switch self {
        case .tracking: return "eye.circle"
        case .sessions: return "clock.arrow.circlepath"
        case .settings: return "gearshape"
        case .about:    return "info.circle"
        }
    }
}

/// Observable object for sharing tab selection across the app.
@MainActor
final class TabSelection: ObservableObject {
    @Published var selectedTab: TabIdentifier = .tracking
}
