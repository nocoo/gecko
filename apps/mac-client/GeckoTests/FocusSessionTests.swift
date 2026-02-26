import XCTest
@testable import Gecko

final class FocusSessionTests: XCTestCase {

    // MARK: - Factory: start()

    func testStartCreatesActiveSession() {
        let session = FocusSession.start(appName: "Cursor", windowTitle: "main.swift - Gecko")

        XCTAssertFalse(session.id.isEmpty)
        XCTAssertEqual(session.appName, "Cursor")
        XCTAssertEqual(session.windowTitle, "main.swift - Gecko")
        XCTAssertNil(session.url)
        XCTAssertNil(session.bundleId)
        XCTAssertNil(session.tabTitle)
        XCTAssertNil(session.tabCount)
        XCTAssertNil(session.documentPath)
        XCTAssertFalse(session.isFullScreen)
        XCTAssertFalse(session.isMinimized)
        XCTAssertEqual(session.duration, 0)
        XCTAssertEqual(session.startTime, session.endTime)
        XCTAssertTrue(session.isActive)
    }

    func testStartWithURLSetsURL() {
        let session = FocusSession.start(
            appName: "Google Chrome",
            windowTitle: "GitHub",
            url: "https://github.com"
        )

        XCTAssertEqual(session.url, "https://github.com")
        XCTAssertTrue(session.isActive)
    }

    func testStartWithAllRichContextFields() {
        let session = FocusSession.start(
            appName: "Google Chrome",
            windowTitle: "GitHub - gecko",
            bundleId: "com.google.Chrome",
            url: "https://github.com",
            tabTitle: "GitHub - gecko",
            tabCount: 12,
            documentPath: nil,
            isFullScreen: true,
            isMinimized: false
        )

        XCTAssertEqual(session.bundleId, "com.google.Chrome")
        XCTAssertEqual(session.tabTitle, "GitHub - gecko")
        XCTAssertEqual(session.tabCount, 12)
        XCTAssertTrue(session.isFullScreen)
        XCTAssertFalse(session.isMinimized)
        XCTAssertTrue(session.isActive)
    }

    func testStartGeneratesUniqueIDs() {
        let session1 = FocusSession.start(appName: "A", windowTitle: "T")
        let session2 = FocusSession.start(appName: "B", windowTitle: "T")

        XCTAssertNotEqual(session1.id, session2.id)
    }

    // MARK: - finish()

    func testFinishSetsEndTimeAndDuration() {
        var session = FocusSession.start(appName: "Cursor", windowTitle: "test.swift")

        // Use a deterministic end time to avoid same-millisecond flakiness
        let endTime = session.startTime + 5.0
        session.finish(at: endTime)

        XCTAssertEqual(session.endTime, endTime)
        XCTAssertEqual(session.duration, 5.0)
        XCTAssertFalse(session.isActive)
    }

    func testFinishAtSpecificTimestamp() {
        var session = FocusSession(
            id: "test-id",
            appName: "Finder",
            bundleId: "com.apple.finder",
            windowTitle: "Desktop",
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

        session.finish(at: 1030.0)

        XCTAssertEqual(session.endTime, 1030.0)
        XCTAssertEqual(session.duration, 30.0)
        XCTAssertFalse(session.isActive)
    }

    // MARK: - isActive

    func testIsActiveWhenDurationIsZeroAndTimesMatch() {
        let session = FocusSession(
            id: "test-id",
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
        XCTAssertTrue(session.isActive)
    }

    func testIsNotActiveWhenDurationIsPositive() {
        let session = FocusSession(
            id: "test-id",
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
            endTime: 1010.0,
            duration: 10.0
        )
        XCTAssertFalse(session.isActive)
    }

    // MARK: - Equatable

    func testEquatable() {
        let session1 = FocusSession(
            id: "same-id",
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
        let session2 = FocusSession(
            id: "same-id",
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
        XCTAssertEqual(session1, session2)
    }

    // MARK: - Codable roundtrip

    func testCodableRoundtrip() throws {
        let original = FocusSession(
            id: "test-id",
            appName: "Chrome",
            bundleId: "com.google.Chrome",
            windowTitle: "Google",
            url: "https://google.com",
            tabTitle: "Google Search",
            tabCount: 5,
            documentPath: nil,
            isFullScreen: true,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1030.0,
            duration: 30.0
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(original)
        let decoder = JSONDecoder()
        let decoded = try decoder.decode(FocusSession.self, from: data)

        XCTAssertEqual(original, decoded)
    }

    func testCodableRoundtripWithNilOptionals() throws {
        let original = FocusSession(
            id: "test-nil",
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

        let encoder = JSONEncoder()
        let data = try encoder.encode(original)
        let decoder = JSONDecoder()
        let decoded = try decoder.decode(FocusSession.self, from: data)

        XCTAssertEqual(original, decoded)
        XCTAssertNil(decoded.bundleId)
        XCTAssertNil(decoded.tabTitle)
        XCTAssertNil(decoded.tabCount)
        XCTAssertNil(decoded.documentPath)
    }
}
