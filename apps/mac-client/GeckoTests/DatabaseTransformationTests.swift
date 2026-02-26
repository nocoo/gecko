import XCTest
import GRDB
@testable import Gecko

// Tests for data transformation edge cases through the DB roundtrip layer.
// Verifies that boundary values, unicode, special characters, and unusual
// inputs survive insert → fetch without corruption.
final class DatabaseTransformationTests: XCTestCase {

    private var db: DatabaseManager! // swiftlint:disable:this implicitly_unwrapped_optional

    override func setUp() async throws {
        db = try DatabaseManager.makeInMemory()
    }

    // MARK: - Empty vs Nil

    func testEmptyStringVsNilURLRoundtrip() throws {
        // Empty string URL should persist as empty string, not nil
        let session = FocusSession(
            id: "empty-url",
            appName: "Chrome",
            bundleId: nil,
            windowTitle: "New Tab",
            url: "",
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
        let fetched = try db.fetch(id: "empty-url")
        // Empty string persists as empty string (not coerced to nil)
        XCTAssertEqual(fetched?.url, "")
    }

    // MARK: - Special Characters

    func testSpecialCharactersInWindowTitle() throws {
        let title = "He said \"hello\" & <goodbye> — it's a 'test' with \\backslash"
        let session = FocusSession(
            id: "special-chars",
            appName: "App",
            bundleId: nil,
            windowTitle: title,
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
        let fetched = try db.fetch(id: "special-chars")
        XCTAssertEqual(fetched?.windowTitle, title)
    }

    // MARK: - Unicode & Emoji

    func testUnicodeInAllStringFields() throws {
        let session = FocusSession(
            id: "unicode-test",
            appName: "日本語アプリ",
            bundleId: "com.テスト.app",
            windowTitle: "Документ — Привет мир",
            url: "https://例え.jp/パス?q=検索",
            tabTitle: "العربية タブ",
            tabCount: 3,
            documentPath: "/Users/test/文档/ファイル.txt",
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1010.0,
            duration: 10.0
        )
        try db.insert(session)
        let fetched = try db.fetch(id: "unicode-test")

        XCTAssertEqual(fetched?.appName, "日本語アプリ")
        XCTAssertEqual(fetched?.bundleId, "com.テスト.app")
        XCTAssertEqual(fetched?.windowTitle, "Документ — Привет мир")
        XCTAssertEqual(fetched?.url, "https://例え.jp/パス?q=検索")
        XCTAssertEqual(fetched?.tabTitle, "العربية タブ")
        XCTAssertEqual(fetched?.documentPath, "/Users/test/文档/ファイル.txt")
    }

    func testEmojiInAppNameAndTitle() throws {
        let session = FocusSession(
            id: "emoji-test",
            appName: "🦎 Gecko",
            bundleId: nil,
            windowTitle: "🔥 Hot Feature 🚀✨",
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
        let fetched = try db.fetch(id: "emoji-test")
        XCTAssertEqual(fetched?.appName, "🦎 Gecko")
        XCTAssertEqual(fetched?.windowTitle, "🔥 Hot Feature 🚀✨")
    }

    // MARK: - Duration Edge Cases

    func testNegativeDurationPersists() throws {
        // Negative duration is logically invalid but should not crash DB
        let session = FocusSession(
            id: "neg-duration",
            appName: "App",
            bundleId: nil,
            windowTitle: "Win",
            url: nil,
            tabTitle: nil,
            tabCount: nil,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 1010.0,
            endTime: 1000.0,
            duration: -10.0
        )
        try db.insert(session)
        let fetched = try db.fetch(id: "neg-duration")
        XCTAssertEqual(fetched?.duration, -10.0)
    }

    func testZeroDurationPersists() throws {
        let session = FocusSession(
            id: "zero-dur",
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
        try db.insert(session)
        let fetched = try db.fetch(id: "zero-dur")
        XCTAssertEqual(fetched?.duration, 0)
        XCTAssertTrue(fetched?.isActive ?? false)
    }

    // MARK: - Boundary Values

    func testBoundaryTimestampValues() throws {
        // Very large timestamp (year ~2286)
        let session = FocusSession(
            id: "future-ts",
            appName: "App",
            bundleId: nil,
            windowTitle: "Win",
            url: nil,
            tabTitle: nil,
            tabCount: nil,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 9_999_999_999.0,
            endTime: 9_999_999_999.0 + 60.0,
            duration: 60.0
        )
        try db.insert(session)
        let fetched = try db.fetch(id: "future-ts")
        XCTAssertEqual(fetched?.startTime, 9_999_999_999.0)
        XCTAssertEqual(fetched?.endTime, 9_999_999_999.0 + 60.0)
    }

    func testVeryLongStringFieldsPersist() throws {
        let longTitle = String(repeating: "A", count: 10_000)
        let longURL = "https://example.com/" + String(repeating: "x", count: 10_000)
        let session = FocusSession(
            id: "long-strings",
            appName: "App",
            bundleId: nil,
            windowTitle: longTitle,
            url: longURL,
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
        let fetched = try db.fetch(id: "long-strings")
        XCTAssertEqual(fetched?.windowTitle.count, 10_000)
        XCTAssertEqual(fetched?.url?.count, 10_020) // "https://example.com/" (20) + 10000 x's
    }

    func testTabCountZeroAndLargeValues() throws {
        // Tab count 0
        let session0 = FocusSession(
            id: "tab-0",
            appName: "Chrome",
            bundleId: nil,
            windowTitle: "Win",
            url: nil,
            tabTitle: nil,
            tabCount: 0,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1010.0,
            duration: 10.0
        )
        try db.insert(session0)
        XCTAssertEqual(try db.fetch(id: "tab-0")?.tabCount, 0)

        // Very large tab count
        let sessionBig = FocusSession(
            id: "tab-big",
            appName: "Chrome",
            bundleId: nil,
            windowTitle: "Win",
            url: nil,
            tabTitle: nil,
            tabCount: 999_999,
            documentPath: nil,
            isFullScreen: false,
            isMinimized: false,
            startTime: 2000.0,
            endTime: 2010.0,
            duration: 10.0
        )
        try db.insert(sessionBig)
        XCTAssertEqual(try db.fetch(id: "tab-big")?.tabCount, 999_999)
    }

    // MARK: - SQL Injection Resilience

    func testSQLInjectionInStringFields() throws {
        // Strings that look like SQL injection should be safely escaped by GRDB
        let malicious = "'; DROP TABLE focus_sessions; --"
        let session = FocusSession(
            id: "sql-inject",
            appName: malicious,
            bundleId: nil,
            windowTitle: malicious,
            url: malicious,
            tabTitle: malicious,
            tabCount: nil,
            documentPath: malicious,
            isFullScreen: false,
            isMinimized: false,
            startTime: 1000.0,
            endTime: 1010.0,
            duration: 10.0
        )
        try db.insert(session)

        // Table still exists and data is correct
        XCTAssertGreaterThanOrEqual(try db.count(), 1)
        let fetched = try db.fetch(id: "sql-inject")
        XCTAssertEqual(fetched?.appName, malicious)
        XCTAssertEqual(fetched?.windowTitle, malicious)
        XCTAssertEqual(fetched?.url, malicious)
    }
}
