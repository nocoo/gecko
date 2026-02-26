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

    /// The bundle identifier of the focused application (e.g., "com.google.Chrome").
    var bundleId: String?

    /// The title of the focused window (e.g., "gecko-prompt.md - Cursor").
    var windowTitle: String

    /// The URL of the active browser tab, if applicable. Nil for non-browser apps.
    var url: String?

    /// The title of the active browser tab (cleaner than window title). Nil for non-browser apps.
    var tabTitle: String?

    /// The number of open tabs in the browser. Nil for non-browser apps.
    var tabCount: Int?

    /// The path of the document open in the focused window (via AXDocumentAttribute). Nil if unavailable.
    var documentPath: String?

    /// Whether the focused window is in full-screen mode.
    var isFullScreen: Bool

    /// Whether the focused window is minimized.
    var isMinimized: Bool

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
        case bundleId = "bundle_id"
        case windowTitle = "window_title"
        case url
        case tabTitle = "tab_title"
        case tabCount = "tab_count"
        case documentPath = "document_path"
        case isFullScreen = "is_full_screen"
        case isMinimized = "is_minimized"
        case startTime = "start_time"
        case endTime = "end_time"
        case duration
    }

    /// Map Swift property names to database column names.
    enum CodingKeys: String, CodingKey {
        case id
        case appName = "app_name"
        case bundleId = "bundle_id"
        case windowTitle = "window_title"
        case url
        case tabTitle = "tab_title"
        case tabCount = "tab_count"
        case documentPath = "document_path"
        case isFullScreen = "is_full_screen"
        case isMinimized = "is_minimized"
        case startTime = "start_time"
        case endTime = "end_time"
        case duration
    }
}

// MARK: - Factory

extension FocusSession {
    /// Create a new active session starting now.
    static func start(
        appName: String,
        windowTitle: String,
        bundleId: String? = nil,
        url: String? = nil,
        tabTitle: String? = nil,
        tabCount: Int? = nil,
        documentPath: String? = nil,
        isFullScreen: Bool = false,
        isMinimized: Bool = false
    ) -> FocusSession {
        let now = Date().timeIntervalSince1970
        return FocusSession(
            id: UUID().uuidString,
            appName: appName,
            bundleId: bundleId,
            windowTitle: windowTitle,
            url: url,
            tabTitle: tabTitle,
            tabCount: tabCount,
            documentPath: documentPath,
            isFullScreen: isFullScreen,
            isMinimized: isMinimized,
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
