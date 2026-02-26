import Foundation

/// ViewModel for the session list, decoupling SessionListView from TrackingEngine.
///
/// Owns the list of recent sessions and refresh logic.
/// Depends on DatabaseService protocol for testability.
@MainActor
final class SessionListViewModel: ObservableObject {

    // MARK: - Published State

    @Published private(set) var recentSessions: [FocusSession] = []

    // MARK: - Dependencies

    private let db: any DatabaseService

    // MARK: - Constants

    private static let defaultLimit = 50

    // MARK: - Init

    init(db: any DatabaseService) {
        self.db = db
        refresh()
    }

    // MARK: - Public API

    /// Reload recent sessions from the database on a background thread.
    func refresh() {
        let database = db
        let limit = Self.defaultLimit
        Task.detached(priority: .userInitiated) {
            do {
                let sessions = try database.fetchRecent(limit: limit)
                await MainActor.run {
                    self.recentSessions = sessions
                }
            } catch {
                print("[SessionListViewModel] Failed to load sessions: \(error)")
            }
        }
    }

    /// Number of sessions currently loaded.
    var sessionCount: Int {
        recentSessions.count
    }
}
