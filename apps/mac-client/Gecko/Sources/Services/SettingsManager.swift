import Foundation

/// Manages user-configurable settings persisted via UserDefaults.
///
/// Currently supports:
/// - Custom SQLite database path
@MainActor
final class SettingsManager: ObservableObject {

    // MARK: - Keys

    private enum Keys {
        static let databasePath = "gecko.settings.databasePath"
    }

    // MARK: - Storage

    private let defaults: UserDefaults

    // MARK: - Published State

    /// The current database file path. Falls back to the default location.
    @Published var databasePath: String {
        didSet {
            defaults.set(databasePath, forKey: Keys.databasePath)
        }
    }

    // MARK: - Init

    init() {
        self.defaults = .standard
        self.databasePath = UserDefaults.standard.string(forKey: Keys.databasePath)
            ?? Self.defaultDatabasePath
    }

    /// For testing: init with a custom UserDefaults suite.
    init(defaults: UserDefaults, defaultPath: String? = nil) {
        self.defaults = defaults
        self.databasePath = defaults.string(forKey: Keys.databasePath)
            ?? defaultPath
            ?? Self.defaultDatabasePath
    }

    // MARK: - Default Path

    /// The default database path: ~/Library/Application Support/com.gecko.app/gecko.sqlite
    static var defaultDatabasePath: String {
        DatabaseManager.databaseURL.path
    }

    /// Whether the current path differs from the default.
    var isCustomPath: Bool {
        databasePath != Self.defaultDatabasePath
    }

    /// Reset to the default database path.
    func resetToDefault() {
        databasePath = Self.defaultDatabasePath
    }

    /// Validate that the directory of the given path exists (or can be created).
    func validatePath(_ path: String) -> Bool {
        let url = URL(fileURLWithPath: path)
        let directory = url.deletingLastPathComponent()
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDir) {
            return isDir.boolValue
        }
        // Try creating the directory
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            return true
        } catch {
            return false
        }
    }
}
