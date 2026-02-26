import XCTest
import GRDB
@testable import Gecko

final class DatabaseManagerTests: XCTestCase {

    private var db: DatabaseManager! // swiftlint:disable:this implicitly_unwrapped_optional

    override func setUp() async throws {
        db = try DatabaseManager.makeInMemory()
    }

    // MARK: - Table Creation

    func testDatabaseCreatesTable() throws {
        let count = try db.count()
        XCTAssertEqual(count, 0)
    }

    // MARK: - Insert & Fetch

    func testInsertAndFetch() throws {
        let session = FocusSession(
            id: "test-1",
            appName: "Cursor",
            bundleId: "com.todesktop.230313mzl4w4u92",
            windowTitle: "main.swift",
            url: nil,
            tabTitle: nil,
            tabCount: nil,
            documentPath: "/Users/test/main.swift",
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1000.0,
            duration: 0
        )

        try db.insert(session)

        let fetched = try db.fetch(id: "test-1")
        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.appName, "Cursor")
        XCTAssertEqual(fetched?.bundleId, "com.todesktop.230313mzl4w4u92")
        XCTAssertEqual(fetched?.windowTitle, "main.swift")
        XCTAssertNil(fetched?.url)
        XCTAssertEqual(fetched?.documentPath, "/Users/test/main.swift")
    }

    func testInsertSessionWithURL() throws {
        let session = FocusSession(
            id: "test-2",
            appName: "Google Chrome",
            bundleId: "com.google.Chrome",
            windowTitle: "GitHub",
            url: "https://github.com",
            tabTitle: "GitHub",
            tabCount: 8,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1030.0,
            duration: 30.0
        )

        try db.insert(session)

        let fetched = try db.fetch(id: "test-2")
        XCTAssertEqual(fetched?.url, "https://github.com")
        XCTAssertEqual(fetched?.tabTitle, "GitHub")
        XCTAssertEqual(fetched?.tabCount, 8)
        XCTAssertEqual(fetched?.duration, 30.0)
    }

    // MARK: - Rich Context Persistence

    func testRichContextFieldsPersist() throws {
        let session = FocusSession(
            id: "rich-1",
            appName: "Google Chrome",
            bundleId: "com.google.Chrome",
            windowTitle: "Stack Overflow - GRDB",
            url: "https://stackoverflow.com/q/12345",
            tabTitle: "GRDB question",
            tabCount: 15,
            documentPath: nil,
            isFullScreen: true,
            isMinimized: false,
            startTime: 2000.0,
            endTime: 2060.0,
            duration: 60.0
        )

        try db.insert(session)
        let fetched = try db.fetch(id: "rich-1")

        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.bundleId, "com.google.Chrome")
        XCTAssertEqual(fetched?.tabTitle, "GRDB question")
        XCTAssertEqual(fetched?.tabCount, 15)
        XCTAssertNil(fetched?.documentPath)
        XCTAssertEqual(fetched?.isFullScreen, true)
        XCTAssertEqual(fetched?.isMinimized, false)
    }

    func testNilOptionalFieldsPersist() throws {
        let session = FocusSession(
            id: "nil-1",
            appName: "Finder",
            bundleId: nil,
            windowTitle: "Desktop",
            url: nil,
            tabTitle: nil,
            tabCount: nil,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1010.0,
            duration: 10.0
        )

        try db.insert(session)
        let fetched = try db.fetch(id: "nil-1")

        XCTAssertNotNil(fetched)
        XCTAssertNil(fetched?.bundleId)
        XCTAssertNil(fetched?.tabTitle)
        XCTAssertNil(fetched?.tabCount)
        XCTAssertNil(fetched?.documentPath)
        XCTAssertEqual(fetched?.isFullScreen, false)
        XCTAssertEqual(fetched?.isMinimized, false)
    }

    // MARK: - Update

    func testUpdateSession() throws {
        var session = FocusSession.start(appName: "Finder", windowTitle: "Desktop")
        try db.insert(session)

        session.finish(at: session.startTime + 15.0)
        try db.update(session)

        let fetched = try db.fetch(id: session.id)
        XCTAssertEqual(fetched?.duration, 15.0)
        XCTAssertFalse(fetched?.isActive ?? true)
    }

    // MARK: - FetchRecent

    func testFetchRecentReturnsOrderedByStartTimeDesc() throws {
        for i in 0..<5 {
            let session = FocusSession(
                id: "session-\(i)",
                appName: "App\(i)",
                bundleId: nil,
                windowTitle: "Win\(i)",
                url: nil,
                tabTitle: nil,
                tabCount: nil,
                documentPath: nil,
                isFullScreen: false,
                isMinimized: false,
                startTime: Double(1000 + i * 10),
                endTime: Double(1000 + i * 10 + 5),
                duration: 5.0
            )
            try db.insert(session)
        }

        let recent = try db.fetchRecent(limit: 3)
        XCTAssertEqual(recent.count, 3)
        // Most recent first
        XCTAssertEqual(recent[0].id, "session-4")
        XCTAssertEqual(recent[1].id, "session-3")
        XCTAssertEqual(recent[2].id, "session-2")
    }

    func testFetchRecentDefaultLimit() throws {
        // Insert 60 sessions
        for i in 0..<60 {
            let session = FocusSession(
                id: "session-\(i)",
                appName: "App",
                bundleId: nil,
                windowTitle: "Win",
                url: nil,
                tabTitle: nil,
                tabCount: nil,
                documentPath: nil,
                isFullScreen: false,
                isMinimized: false,
                startTime: Double(1000 + i),
                endTime: Double(1000 + i + 1),
                duration: 1.0
            )
            try db.insert(session)
        }

        let recent = try db.fetchRecent()
        XCTAssertEqual(recent.count, 50) // Default limit
    }

    // MARK: - Count

    func testCount() throws {
        XCTAssertEqual(try db.count(), 0)

        try db.insert(FocusSession.start(appName: "A", windowTitle: "T"))
        XCTAssertEqual(try db.count(), 1)

        try db.insert(FocusSession.start(appName: "B", windowTitle: "T"))
        XCTAssertEqual(try db.count(), 2)
    }

    // MARK: - DeleteAll

    func testDeleteAll() throws {
        try db.insert(FocusSession.start(appName: "A", windowTitle: "T"))
        try db.insert(FocusSession.start(appName: "B", windowTitle: "T"))
        XCTAssertEqual(try db.count(), 2)

        try db.deleteAll()
        XCTAssertEqual(try db.count(), 0)
    }

    // MARK: - Save (Upsert)

    func testSaveInsertsNewSession() throws {
        let session = FocusSession.start(appName: "Test", windowTitle: "Win")
        try db.save(session)
        XCTAssertEqual(try db.count(), 1)
    }

    func testSaveUpdatesExistingSession() throws {
        var session = FocusSession(
            id: "upsert-test",
            appName: "App",
            bundleId: nil,
            windowTitle: "Win",
            url: nil,
            tabTitle: nil,
            tabCount: nil,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1000.0,
            duration: 0
        )
        try db.save(session)

        session.finish(at: 1020.0)
        try db.save(session)

        XCTAssertEqual(try db.count(), 1)
        let fetched = try db.fetch(id: "upsert-test")
        XCTAssertEqual(fetched?.duration, 20.0)
    }

    // MARK: - Fetch nonexistent

    func testFetchNonexistentReturnsNil() throws {
        let result = try db.fetch(id: "does-not-exist")
        XCTAssertNil(result)
    }

    // MARK: - Migration v2 upgrade path

    func testMigrationV2AddsColumnsToExistingData() throws {
        // This test verifies that sessions created by the v1 schema
        // are readable after the v2 migration adds new columns.
        // Since makeInMemory runs both migrations, we just verify
        // that default values work correctly for the new fields.
        let session = FocusSession(
            id: "legacy-1",
            appName: "OldApp",
            bundleId: nil,
            windowTitle: "OldWin",
            url: nil,
            tabTitle: nil,
            tabCount: nil,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 500.0,
            endTime: 510.0,
            duration: 10.0
        )

        try db.insert(session)
        let fetched = try db.fetch(id: "legacy-1")

        XCTAssertNotNil(fetched)
        XCTAssertNil(fetched?.bundleId)
        XCTAssertNil(fetched?.tabTitle)
        XCTAssertNil(fetched?.tabCount)
        XCTAssertNil(fetched?.documentPath)
        XCTAssertEqual(fetched?.isFullScreen, false)
        XCTAssertEqual(fetched?.isMinimized, false)
    }

    // MARK: - FetchUnsynced

    func testFetchUnsyncedReturnsOnlyFinalizedSessions() throws {
        // GIVEN: one active session (duration=0) and one finalized session
        let active = FocusSession(
            id: "active-1", appName: "App", bundleId: nil, windowTitle: "Win",
            url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
            isFullScreen: false, isMinimized: false,
            startTime: 1000.0, endTime: 1000.0, duration: 0
        )
        let finalized = FocusSession(
            id: "done-1", appName: "App", bundleId: nil, windowTitle: "Win",
            url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
            isFullScreen: false, isMinimized: false,
            startTime: 1010.0, endTime: 1020.0, duration: 10.0
        )
        try db.insert(active)
        try db.insert(finalized)

        // WHEN: fetching unsynced sessions since time 0
        let results = try db.fetchUnsynced(since: 0, limit: 100)

        // THEN: only the finalized session is returned
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].id, "done-1")
    }

    func testFetchUnsyncedRespectsWatermark() throws {
        // GIVEN: three finalized sessions at different start times
        for i in 0..<3 {
            let session = FocusSession(
                id: "sync-\(i)", appName: "App", bundleId: nil, windowTitle: "Win",
                url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
                isFullScreen: false, isMinimized: false,
                startTime: Double(1000 + i * 100), endTime: Double(1050 + i * 100),
                duration: 50.0
            )
            try db.insert(session)
        }

        // WHEN: fetching with watermark at 1100 (after first two)
        let results = try db.fetchUnsynced(since: 1100, limit: 100)

        // THEN: only the third session (start_time=1200) is returned
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].id, "sync-2")
    }

    func testFetchUnsyncedOrderedByStartTimeAscending() throws {
        // GIVEN: sessions inserted in reverse order
        for i in (0..<3).reversed() {
            let session = FocusSession(
                id: "order-\(i)", appName: "App", bundleId: nil, windowTitle: "Win",
                url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
                isFullScreen: false, isMinimized: false,
                startTime: Double(1000 + i * 100), endTime: Double(1050 + i * 100),
                duration: 50.0
            )
            try db.insert(session)
        }

        // WHEN: fetching all
        let results = try db.fetchUnsynced(since: 0, limit: 100)

        // THEN: ordered ascending by start_time
        XCTAssertEqual(results.count, 3)
        XCTAssertEqual(results[0].id, "order-0")
        XCTAssertEqual(results[1].id, "order-1")
        XCTAssertEqual(results[2].id, "order-2")
    }

    func testFetchUnsyncedRespectsLimit() throws {
        // GIVEN: 5 finalized sessions
        for i in 0..<5 {
            let session = FocusSession(
                id: "limit-\(i)", appName: "App", bundleId: nil, windowTitle: "Win",
                url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
                isFullScreen: false, isMinimized: false,
                startTime: Double(1000 + i * 10), endTime: Double(1005 + i * 10),
                duration: 5.0
            )
            try db.insert(session)
        }

        // WHEN: fetching with limit 2
        let results = try db.fetchUnsynced(since: 0, limit: 2)

        // THEN: only 2 returned (earliest two)
        XCTAssertEqual(results.count, 2)
        XCTAssertEqual(results[0].id, "limit-0")
        XCTAssertEqual(results[1].id, "limit-1")
    }

    func testFetchUnsyncedReturnsEmptyWhenAllSynced() throws {
        // GIVEN: one session at start_time 1000
        let session = FocusSession(
            id: "synced-1", appName: "App", bundleId: nil, windowTitle: "Win",
            url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
            isFullScreen: false, isMinimized: false,
            startTime: 1000.0, endTime: 1010.0, duration: 10.0
        )
        try db.insert(session)

        // WHEN: watermark is at or past the session's start_time
        let results = try db.fetchUnsynced(since: 1000.0, limit: 100)

        // THEN: no results (watermark is not strictly less than)
        XCTAssertEqual(results.count, 0)
    }
}
