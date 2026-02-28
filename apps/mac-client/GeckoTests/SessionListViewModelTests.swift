import XCTest
@testable import Gecko

@MainActor
final class SessionListViewModelTests: XCTestCase {

    // MARK: - Helpers

    private func makeDB() throws -> DatabaseManager {
        try DatabaseManager.makeInMemory()
    }

    private func makeSessions(count: Int, in db: DatabaseManager) throws {
        for i in 0..<count {
            let session = FocusSession(
                id: "test-\(i)",
                appName: "App\(i)",
                windowTitle: "Window \(i)",
                isFullScreen: false,
                isMinimized: false,
                startTime: Double(1000 + i * 10),
                endTime: Double(1000 + i * 10 + 5),
                duration: 5.0
            )
            try db.insert(session)
        }
    }

    // MARK: - Init

    func testInitLoadsSessionsFromDB() async throws {
        let db = try makeDB()
        try makeSessions(count: 3, in: db)

        let viewModel = SessionListViewModel(db: db)

        // Allow Task.detached to complete
        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(viewModel.recentSessions.count, 3)
        XCTAssertEqual(viewModel.sessionCount, 3)
    }

    func testInitWithEmptyDB() async throws {
        let db = try makeDB()

        let viewModel = SessionListViewModel(db: db)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(viewModel.recentSessions.isEmpty)
        XCTAssertEqual(viewModel.sessionCount, 0)
    }

    // MARK: - Refresh

    func testRefreshPicksUpNewSessions() async throws {
        let db = try makeDB()
        let viewModel = SessionListViewModel(db: db)

        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(viewModel.sessionCount, 0)

        // Insert sessions after init
        try makeSessions(count: 5, in: db)
        viewModel.refresh()

        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(viewModel.sessionCount, 5)
    }

    func testRefreshSetsShouldScrollToTop() async throws {
        let db = try makeDB()
        try makeSessions(count: 3, in: db)

        let viewModel = SessionListViewModel(db: db)

        // init() also calls refresh(), wait for it
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(viewModel.shouldScrollToTop, "shouldScrollToTop should be true after refresh")

        // Simulate the view resetting the flag
        viewModel.shouldScrollToTop = false
        XCTAssertFalse(viewModel.shouldScrollToTop)

        // Explicit refresh should set it again
        viewModel.refresh()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(viewModel.shouldScrollToTop, "shouldScrollToTop should be true after explicit refresh")
    }

    // MARK: - Ordering

    func testSessionsOrderedByStartTimeDescending() async throws {
        let db = try makeDB()
        try makeSessions(count: 5, in: db)

        let viewModel = SessionListViewModel(db: db)

        try await Task.sleep(nanoseconds: 100_000_000)

        let times = viewModel.recentSessions.map(\.startTime)
        XCTAssertEqual(times, times.sorted(by: >), "Sessions should be in descending start time order")
    }

    // MARK: - Limit

    func testDefaultLimitIs50() async throws {
        let db = try makeDB()
        try makeSessions(count: 60, in: db)

        let viewModel = SessionListViewModel(db: db)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(viewModel.sessionCount, 50, "Should cap at 50 by default")
    }
}
