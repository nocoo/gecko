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

    // MARK: - Scenario: Full session lifecycle

    /// GIVEN a user opens Cursor
    /// WHEN they switch to Chrome
    /// THEN the Cursor session is finalized with correct duration
    /// AND a new Chrome session is started
    func testSessionLifecycleOnAppSwitch() throws {
        // GIVEN: A session starts in Cursor at t=1000
        var cursorSession = FocusSession(
            id: "cursor-1",
            appName: "Cursor",
            windowTitle: "main.swift - Gecko",
            url: nil,
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

        let chromeSession = FocusSession(
            id: "chrome-1",
            appName: "Google Chrome",
            windowTitle: "GitHub - gecko",
            url: "https://github.com/user/gecko",
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

        // AND: Chrome session is active
        let newActive = try db.fetch(id: "chrome-1")
        XCTAssertTrue(newActive?.isActive ?? false)
        XCTAssertEqual(newActive?.url, "https://github.com/user/gecko")
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
            let session = FocusSession(
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
    /// AND a new Stack Overflow session is created with the new URL
    func testBrowserTabSwitch() throws {
        // GIVEN: Browsing GitHub
        var githubSession = FocusSession(
            id: "tab-1",
            appName: "Google Chrome",
            windowTitle: "GitHub - gecko",
            url: "https://github.com/user/gecko",
            startTime: 2000.0,
            endTime: 2000.0,
            duration: 0
        )
        try db.insert(githubSession)

        // WHEN: Switch to Stack Overflow tab at t=2120
        githubSession.finish(at: 2120.0)
        try db.update(githubSession)

        let soSession = FocusSession(
            id: "tab-2",
            appName: "Google Chrome",
            windowTitle: "swift - How to use GRDB - Stack Overflow",
            url: "https://stackoverflow.com/questions/12345",
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
    }

    // MARK: - Scenario: Database persistence roundtrip

    /// GIVEN sessions are written to the database
    /// WHEN we read them back
    /// THEN all fields are preserved exactly
    func testDatabasePersistenceRoundtrip() throws {
        let original = FocusSession(
            id: "roundtrip-1",
            appName: "Safari",
            windowTitle: "Apple Developer Documentation",
            url: "https://developer.apple.com/documentation",
            startTime: 1709000000.0,
            endTime: 1709000300.0,
            duration: 300.0
        )

        try db.insert(original)
        let fetched = try db.fetch(id: "roundtrip-1")

        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.id, original.id)
        XCTAssertEqual(fetched?.appName, original.appName)
        XCTAssertEqual(fetched?.windowTitle, original.windowTitle)
        XCTAssertEqual(fetched?.url, original.url)
        XCTAssertEqual(fetched?.startTime, original.startTime)
        XCTAssertEqual(fetched?.endTime, original.endTime)
        XCTAssertEqual(fetched?.duration, original.duration)
    }

    // MARK: - Scenario: Non-browser app has nil URL

    /// GIVEN a non-browser app is focused
    /// WHEN a session is recorded
    /// THEN the URL field is nil
    func testNonBrowserSessionHasNilURL() throws {
        let session = FocusSession.start(appName: "Cursor", windowTitle: "main.swift")
        try db.insert(session)

        let fetched = try db.fetch(id: session.id)
        XCTAssertNil(fetched?.url)
        XCTAssertFalse(BrowserURLFetcher.isBrowser(appName: "Cursor"))
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
            var session = FocusSession(
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
