import Foundation
import GRDB

/// A single focus session representing the time a user spent in a specific app/window.
///
/// Each session starts when the user switches to an app (or window title changes)
/// and ends when the next switch occurs.
struct FocusSession: Codable, Identifiable, Equatable {
    /// Unique identifier for this session.
    var id: String

    /// The display name of the focused application (e.g., "Google Chrome", "Cursor").
    var appName: String

    /// The title of the focused window (e.g., "gecko-prompt.md - Cursor").
    var windowTitle: String

    /// The URL of the active browser tab, if applicable. Nil for non-browser apps.
    var url: String?

    /// Unix timestamp when the session started.
    var startTime: Double

    /// Unix timestamp when the session ended. Updated when focus switches away.
    var endTime: Double

    /// Duration of the session in seconds (endTime - startTime).
    var duration: Double

    /// Whether this session is still active (focus has not switched away yet).
    var isActive: Bool {
        duration == 0 && endTime == startTime
    }
}

// MARK: - GRDB Conformances

extension FocusSession: FetchableRecord, PersistableRecord, TableRecord {
    static let databaseTableName = "focus_sessions"

    /// Column definitions for type-safe queries.
    enum Columns: String, ColumnExpression {
        case id
        case appName = "app_name"
        case windowTitle = "window_title"
        case url
        case startTime = "start_time"
        case endTime = "end_time"
        case duration
    }

    /// Map Swift property names to database column names.
    enum CodingKeys: String, CodingKey {
        case id
        case appName = "app_name"
        case windowTitle = "window_title"
        case url
        case startTime = "start_time"
        case endTime = "end_time"
        case duration
    }
}

// MARK: - Factory

extension FocusSession {
    /// Create a new active session starting now.
    static func start(appName: String, windowTitle: String, url: String? = nil) -> FocusSession {
        let now = Date().timeIntervalSince1970
        return FocusSession(
            id: UUID().uuidString,
            appName: appName,
            windowTitle: windowTitle,
            url: url,
            startTime: now,
            endTime: now,
            duration: 0
        )
    }

    /// Finalize this session by setting the end time and computing duration.
    mutating func finish() {
        let now = Date().timeIntervalSince1970
        endTime = now
        duration = endTime - startTime
    }

    /// Finalize this session with a specific end time.
    mutating func finish(at timestamp: Double) {
        endTime = timestamp
        duration = endTime - startTime
    }
}
