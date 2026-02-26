import XCTest
@testable import Gecko

final class SessionFormatterTests: XCTestCase {

    // MARK: - formatDuration: Sub-minute

    func testFormatDurationZeroSeconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(0), "0s")
    }

    func testFormatDurationOneSecond() {
        XCTAssertEqual(SessionFormatter.formatDuration(1), "1s")
    }

    func testFormatDuration59Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(59), "59s")
    }

    // MARK: - formatDuration: Minutes

    func testFormatDuration60Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(60), "1m 0s")
    }

    func testFormatDuration61Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(61), "1m 1s")
    }

    func testFormatDuration90Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(90), "1m 30s")
    }

    func testFormatDuration3599Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(3599), "59m 59s")
    }

    // MARK: - formatDuration: Hours

    func testFormatDuration3600Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(3600), "1h 0m")
    }

    func testFormatDuration3661Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(3661), "1h 1m")
    }

    func testFormatDuration7200Seconds() {
        XCTAssertEqual(SessionFormatter.formatDuration(7200), "2h 0m")
    }

    func testFormatDurationLargeValue() {
        // 25 hours = 90000 seconds
        XCTAssertEqual(SessionFormatter.formatDuration(90_000), "25h 0m")
    }

    func testFormatDurationVeryLargeValue() {
        // 100 hours + 59 minutes = 363540 seconds
        XCTAssertEqual(SessionFormatter.formatDuration(363_540), "100h 59m")
    }

    // MARK: - formatDuration: Edge cases

    func testFormatDurationNegativeClampedToZero() {
        XCTAssertEqual(SessionFormatter.formatDuration(-1), "0s")
    }

    func testFormatDurationLargeNegativeClampedToZero() {
        XCTAssertEqual(SessionFormatter.formatDuration(-999_999), "0s")
    }

    func testFormatDurationFractionalSecondsRoundedDown() {
        // Int(0.9) == 0
        XCTAssertEqual(SessionFormatter.formatDuration(0.9), "0s")
    }

    func testFormatDurationFractionalRoundsDown() {
        // Int(61.7) == 61
        XCTAssertEqual(SessionFormatter.formatDuration(61.7), "1m 1s")
    }

    // MARK: - formatTime: Known timestamps

    func testFormatTimeUnixEpoch() {
        // 1970-01-01 00:00:00 UTC — local time depends on timezone
        // We test that it returns a valid HH:mm:ss pattern
        let result = SessionFormatter.formatTime(0)
        let pattern = #"^\d{2}:\d{2}:\d{2}$"#
        XCTAssertNotNil(result.range(of: pattern, options: .regularExpression),
                        "Expected HH:mm:ss format, got: \(result)")
    }

    func testFormatTimeReturnsConsistentFormat() {
        // Two different timestamps should both match HH:mm:ss
        let result1 = SessionFormatter.formatTime(1_000_000)
        let result2 = SessionFormatter.formatTime(1_700_000_000)
        let pattern = #"^\d{2}:\d{2}:\d{2}$"#
        XCTAssertNotNil(result1.range(of: pattern, options: .regularExpression))
        XCTAssertNotNil(result2.range(of: pattern, options: .regularExpression))
    }

    func testFormatTimeDifferentTimestampsProduceDifferentResults() {
        // Timestamps 1 hour apart should produce different times
        let t1 = 1_700_000_000.0
        let t2 = t1 + 3600.0
        XCTAssertNotEqual(SessionFormatter.formatTime(t1), SessionFormatter.formatTime(t2))
    }

    func testFormatTimeSameTimestampProducesSameResult() {
        let timestamp = 1_700_000_000.0
        XCTAssertEqual(SessionFormatter.formatTime(timestamp), SessionFormatter.formatTime(timestamp))
    }

    func testFormatTimeNegativeTimestamp() {
        // Before Unix epoch — should still produce valid format
        let result = SessionFormatter.formatTime(-86400)
        let pattern = #"^\d{2}:\d{2}:\d{2}$"#
        XCTAssertNotNil(result.range(of: pattern, options: .regularExpression),
                        "Negative timestamp should still produce valid HH:mm:ss, got: \(result)")
    }
}
