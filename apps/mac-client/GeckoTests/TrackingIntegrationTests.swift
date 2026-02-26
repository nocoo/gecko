import XCTest
import GRDB
@testable import Gecko

/// Integration / E2E tests for the full tracking pipeline.
///
/// These tests exercise the complete flow from data model through database
/// to engine logic, simulating real user scenarios in BDD style.
/// Uses in-memory SQLite for isolation.
final class TrackingIntegrationTests: XCTestCase {

    private var db: DatabaseManager! // swiftlint:disable:this implicitly_unwrapped_optional

    override func setUp() async throws {
        db = try DatabaseManager.makeInMemory()
    }

    // MARK: - Helper

    // Create a FocusSession with sensible defaults for integration tests.
    // swiftlint:disable:next function_parameter_count
    private func makeSession(
        id: String,
        appName: String,
        windowTitle: String,
        bundleId: String? = nil,
        url: String? = nil,
        tabTitle: String? = nil,
        tabCount: Int? = nil,
        documentPath: String? = nil,
        isFullScreen: Bool = false,
        isMinimized: Bool = false,
        startTime: Double,
        endTime: Double,
        duration: Double
    ) -> FocusSession {
        FocusSession(
            id: id,
            appName: appName,
            bundleId: bundleId,
            windowTitle: windowTitle,
            url: url,
            tabTitle: tabTitle,
            tabCount: tabCount,
            documentPath: documentPath,
            isFullScreen: isFullScreen,
            isMinimized: isMinimized,
            startTime: startTime,
            endTime: endTime,
            duration: duration
        )
    }

    // MARK: - Scenario: Full session lifecycle

    /// GIVEN a user opens Cursor
    /// WHEN they switch to Chrome
    /// THEN the Cursor session is finalized with correct duration
    /// AND a new Chrome session is started with rich context
    func testSessionLifecycleOnAppSwitch() throws {
        // GIVEN: A session starts in Cursor at t=1000
        var cursorSession = makeSession(
            id: "cursor-1",
            appName: "Cursor",
            windowTitle: "main.swift - Gecko",
            bundleId: "com.todesktop.230313mzl4w4u92",
            documentPath: "/Users/test/gecko/main.swift",
            startTime: 1000.0,
            endTime: 1000.0,
            duration: 0
        )
        try db.insert(cursorSession)

        // Verify it's active
        let active = try db.fetch(id: "cursor-1")
        XCTAssertTrue(active?.isActive ?? false, "Session should be active initially")

        // WHEN: User switches to Chrome at t=1045 (45 seconds later)
        cursorSession.finish(at: 1045.0)
        try db.update(cursorSession)

        let chromeSession = makeSession(
            id: "chrome-1",
            appName: "Google Chrome",
            windowTitle: "GitHub - gecko",
            bundleId: "com.google.Chrome",
            url: "https://github.com/user/gecko",
            tabTitle: "GitHub - gecko",
            tabCount: 12,
            startTime: 1045.0,
            endTime: 1045.0,
            duration: 0
        )
        try db.insert(chromeSession)

        // THEN: Cursor session is finalized
        let finalized = try db.fetch(id: "cursor-1")
        XCTAssertNotNil(finalized)
        XCTAssertEqual(finalized?.duration, 45.0)
        XCTAssertFalse(finalized?.isActive ?? true, "Session should no longer be active")
        XCTAssertEqual(finalized?.bundleId, "com.todesktop.230313mzl4w4u92")
        XCTAssertEqual(finalized?.documentPath, "/Users/test/gecko/main.swift")

        // AND: Chrome session is active with rich context
        let newActive = try db.fetch(id: "chrome-1")
        XCTAssertTrue(newActive?.isActive ?? false)
        XCTAssertEqual(newActive?.url, "https://github.com/user/gecko")
        XCTAssertEqual(newActive?.bundleId, "com.google.Chrome")
        XCTAssertEqual(newActive?.tabTitle, "GitHub - gecko")
        XCTAssertEqual(newActive?.tabCount, 12)
    }

    // MARK: - Scenario: Multiple rapid switches

    /// GIVEN a user rapidly switches between 5 apps
    /// WHEN all sessions are recorded
    /// THEN fetchRecent returns them in reverse chronological order
    /// AND all durations are correct
    func testMultipleRapidSwitches() throws {
        let apps = ["Finder", "Cursor", "Chrome", "Slack", "Terminal"]
        var sessions: [FocusSession] = []

        for (index, app) in apps.enumerated() {
            let startTime = Double(1000 + index * 10)
            let session = makeSession(
                id: "rapid-\(index)",
                appName: app,
                windowTitle: "\(app) Window",
                url: app == "Chrome" ? "https://example.com" : nil,
                startTime: startTime,
                endTime: startTime,
                duration: 0
            )
            sessions.append(session)
        }

        // Insert all sessions
        for session in sessions {
            try db.insert(session)
        }

        // Finalize all except the last one
        for i in 0..<(sessions.count - 1) {
            sessions[i].finish(at: sessions[i + 1].startTime)
            try db.update(sessions[i])
        }

        // Verify ordering
        let recent = try db.fetchRecent(limit: 10)
        XCTAssertEqual(recent.count, 5)
        XCTAssertEqual(recent[0].appName, "Terminal") // Most recent
        XCTAssertEqual(recent[4].appName, "Finder")   // Oldest

        // Verify durations
        for i in 0..<4 {
            let session = try db.fetch(id: "rapid-\(i)")
            XCTAssertEqual(session?.duration, 10.0, "Each session should be 10 seconds")
        }

        // Last session is still active
        let lastSession = try db.fetch(id: "rapid-4")
        XCTAssertTrue(lastSession?.isActive ?? false)
    }

    // MARK: - Scenario: Browser tab switching (same app, URL changes)

    /// GIVEN a user is in Chrome on GitHub
    /// WHEN they switch to a different tab (Stack Overflow)
    /// THEN the GitHub session is finalized
    /// AND a new Stack Overflow session is created with the new URL and tab info
    func testBrowserTabSwitch() throws {
        // GIVEN: Browsing GitHub
        var githubSession = makeSession(
            id: "tab-1",
            appName: "Google Chrome",
            windowTitle: "GitHub - gecko",
            bundleId: "com.google.Chrome",
            url: "https://github.com/user/gecko",
            tabTitle: "GitHub - gecko",
            tabCount: 8,
            startTime: 2000.0,
            endTime: 2000.0,
            duration: 0
        )
        try db.insert(githubSession)

        // WHEN: Switch to Stack Overflow tab at t=2120
        githubSession.finish(at: 2120.0)
        try db.update(githubSession)

        let soSession = makeSession(
            id: "tab-2",
            appName: "Google Chrome",
            windowTitle: "swift - How to use GRDB - Stack Overflow",
            bundleId: "com.google.Chrome",
            url: "https://stackoverflow.com/questions/12345",
            tabTitle: "How to use GRDB",
            tabCount: 9,
            startTime: 2120.0,
            endTime: 2120.0,
            duration: 0
        )
        try db.insert(soSession)

        // THEN: Both sessions exist, same app but different URLs
        let github = try db.fetch(id: "tab-1")
        let stackoverflow = try db.fetch(id: "tab-2")

        XCTAssertEqual(github?.appName, "Google Chrome")
        XCTAssertEqual(stackoverflow?.appName, "Google Chrome")
        XCTAssertNotEqual(github?.url, stackoverflow?.url)
        XCTAssertEqual(github?.duration, 120.0) // 2 minutes
        XCTAssertTrue(stackoverflow?.isActive ?? false)

        // Both have the same bundleId but different tab info
        XCTAssertEqual(github?.bundleId, stackoverflow?.bundleId)
        XCTAssertNotEqual(github?.tabTitle, stackoverflow?.tabTitle)
        XCTAssertEqual(stackoverflow?.tabTitle, "How to use GRDB")
        XCTAssertEqual(stackoverflow?.tabCount, 9)
    }

    // MARK: - Scenario: Database persistence roundtrip with rich context

    /// GIVEN sessions are written to the database with all rich context fields
    /// WHEN we read them back
    /// THEN all fields are preserved exactly
    func testDatabasePersistenceRoundtrip() throws {
        let original = makeSession(
            id: "roundtrip-1",
            appName: "Safari",
            windowTitle: "Apple Developer Documentation",
            bundleId: "com.apple.Safari",
            url: "https://developer.apple.com/documentation",
            tabTitle: "Apple Developer Documentation",
            tabCount: 3,
            documentPath: nil,
            isFullScreen: true,
            isMinimized: false,
            startTime: 1709000000.0,
            endTime: 1709000300.0,
            duration: 300.0
        )

        try db.insert(original)
        let fetched = try db.fetch(id: "roundtrip-1")

        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.id, original.id)
        XCTAssertEqual(fetched?.appName, original.appName)
        XCTAssertEqual(fetched?.bundleId, original.bundleId)
        XCTAssertEqual(fetched?.windowTitle, original.windowTitle)
        XCTAssertEqual(fetched?.url, original.url)
        XCTAssertEqual(fetched?.tabTitle, original.tabTitle)
        XCTAssertEqual(fetched?.tabCount, original.tabCount)
        XCTAssertEqual(fetched?.documentPath, original.documentPath)
        XCTAssertEqual(fetched?.isFullScreen, original.isFullScreen)
        XCTAssertEqual(fetched?.isMinimized, original.isMinimized)
        XCTAssertEqual(fetched?.startTime, original.startTime)
        XCTAssertEqual(fetched?.endTime, original.endTime)
        XCTAssertEqual(fetched?.duration, original.duration)
    }

    // MARK: - Scenario: Non-browser app has nil URL

    /// GIVEN a non-browser app is focused
    /// WHEN a session is recorded
    /// THEN the URL, tabTitle, and tabCount fields are nil
    func testNonBrowserSessionHasNilBrowserFields() throws {
        let session = FocusSession.start(
            appName: "Cursor",
            windowTitle: "main.swift",
            bundleId: "com.todesktop.230313mzl4w4u92",
            documentPath: "/Users/test/main.swift"
        )
        try db.insert(session)

        let fetched = try db.fetch(id: session.id)
        XCTAssertNil(fetched?.url)
        XCTAssertNil(fetched?.tabTitle)
        XCTAssertNil(fetched?.tabCount)
        XCTAssertEqual(fetched?.bundleId, "com.todesktop.230313mzl4w4u92")
        XCTAssertEqual(fetched?.documentPath, "/Users/test/main.swift")
        XCTAssertFalse(BrowserURLFetcher.isBrowser(appName: "Cursor"))
    }

    // MARK: - Scenario: Full-screen and minimized state

    /// GIVEN a window in full-screen mode
    /// WHEN the session is recorded
    /// THEN isFullScreen is persisted correctly
    func testFullScreenStatePersists() throws {
        let session = makeSession(
            id: "fs-1",
            appName: "Keynote",
            windowTitle: "Presentation.key",
            bundleId: "com.apple.iWork.Keynote",
            isFullScreen: true,
            isMinimized: false,
            startTime: 3000.0,
            endTime: 3000.0,
            duration: 0
        )
        try db.insert(session)

        let fetched = try db.fetch(id: "fs-1")
        XCTAssertEqual(fetched?.isFullScreen, true)
        XCTAssertEqual(fetched?.isMinimized, false)
    }

    // MARK: - Scenario: Empty database

    /// GIVEN an empty database
    /// WHEN we fetch recent sessions
    /// THEN an empty array is returned (not nil, not an error)
    func testEmptyDatabaseFetchReturnsEmptyArray() throws {
        let sessions = try db.fetchRecent()
        XCTAssertTrue(sessions.isEmpty)
        XCTAssertEqual(try db.count(), 0)
    }

    // MARK: - Scenario: Concurrent writes

    /// GIVEN multiple sessions being written
    /// WHEN they are written sequentially
    /// THEN the database maintains consistency
    func testSequentialWriteConsistency() throws {
        let sessionCount = 100

        for i in 0..<sessionCount {
            var session = makeSession(
                id: "concurrent-\(i)",
                appName: "App\(i % 5)",
                windowTitle: "Window \(i)",
                url: i % 3 == 0 ? "https://example.com/\(i)" : nil,
                startTime: Double(1000 + i),
                endTime: Double(1000 + i),
                duration: 0
            )
            try db.insert(session)

            // Immediately finalize
            session.finish(at: Double(1000 + i + 1))
            try db.update(session)
        }

        XCTAssertEqual(try db.count(), sessionCount)

        let recent = try db.fetchRecent(limit: 50)
        XCTAssertEqual(recent.count, 50)

        // Verify all are finalized
        for session in recent {
            XCTAssertEqual(session.duration, 1.0)
            XCTAssertFalse(session.isActive)
        }
    }
}
