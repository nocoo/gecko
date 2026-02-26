import Foundation

/// Pure formatting utilities for focus session data.
///
/// All methods are static, deterministic, and have no side effects.
/// This makes them trivially testable without any mocking.
enum SessionFormatter {

    // MARK: - Time Formatting

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    /// Format a Unix timestamp as local time "HH:mm:ss".
    static func formatTime(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp)
        return timeFormatter.string(from: date)
    }

    // MARK: - Duration Formatting

    /// Format a duration in seconds to a human-readable string.
    ///
    /// Examples:
    /// - `0`     → `"0s"`
    /// - `45`    → `"45s"`
    /// - `60`    → `"1m 0s"`
    /// - `90`    → `"1m 30s"`
    /// - `3600`  → `"1h 0m"`
    /// - `3661`  → `"1h 1m"`
    /// - `-5`    → `"0s"` (negative values clamped to 0)
    static func formatDuration(_ seconds: Double) -> String {
        let totalSeconds = max(0, Int(seconds))
        if totalSeconds < 60 {
            return "\(totalSeconds)s"
        } else if totalSeconds < 3600 {
            let minutes = totalSeconds / 60
            let secs = totalSeconds % 60
            return "\(minutes)m \(secs)s"
        } else {
            let hours = totalSeconds / 3600
            let minutes = (totalSeconds % 3600) / 60
            return "\(hours)h \(minutes)m"
        }
    }
}
