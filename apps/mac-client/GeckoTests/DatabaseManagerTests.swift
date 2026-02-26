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
            windowTitle: "main.swift",
            url: nil,
            startTime: 1000.0,
            endTime: 1000.0,
            duration: 0
        )

        try db.insert(session)

        let fetched = try db.fetch(id: "test-1")
        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.appName, "Cursor")
        XCTAssertEqual(fetched?.windowTitle, "main.swift")
        XCTAssertNil(fetched?.url)
    }

    func testInsertSessionWithURL() throws {
        let session = FocusSession(
            id: "test-2",
            appName: "Google Chrome",
            windowTitle: "GitHub",
            url: "https://github.com",
            startTime: 1000.0,
            endTime: 1030.0,
            duration: 30.0
        )

        try db.insert(session)

        let fetched = try db.fetch(id: "test-2")
        XCTAssertEqual(fetched?.url, "https://github.com")
        XCTAssertEqual(fetched?.duration, 30.0)
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
                windowTitle: "Win\(i)",
                url: nil,
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
                windowTitle: "Win",
                url: nil,
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
            windowTitle: "Win",
            url: nil,
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
}
