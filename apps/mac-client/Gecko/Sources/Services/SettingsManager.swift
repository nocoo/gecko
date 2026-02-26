import Foundation

/// Manages user-configurable settings persisted via UserDefaults.
///
/// Currently supports:
/// - Custom SQLite database path
/// - Cloud sync configuration (API key, server URL, enable/disable)
@MainActor
final class SettingsManager: ObservableObject {

    // MARK: - Keys

    private enum Keys {
        static let databasePath = "gecko.settings.databasePath"
        static let syncEnabled = "gecko.sync.enabled"
        static let apiKey = "gecko.sync.apiKey"
        static let syncServerUrl = "gecko.sync.serverUrl"
        static let lastSyncedStartTime = "gecko.sync.lastSyncedStartTime"
    }

    // MARK: - Defaults

    static let defaultSyncServerUrl = "https://gecko.dev.hexly.ai"

    // MARK: - Storage

    private let defaults: UserDefaults

    // MARK: - Published State

    /// The current database file path. Falls back to the default location.
    @Published var databasePath: String {
        didSet {
            defaults.set(databasePath, forKey: Keys.databasePath)
        }
    }

    /// Whether cloud sync is enabled.
    @Published var syncEnabled: Bool {
        didSet {
            defaults.set(syncEnabled, forKey: Keys.syncEnabled)
        }
    }

    /// The API key for authenticating with the sync server.
    @Published var apiKey: String {
        didSet {
            defaults.set(apiKey, forKey: Keys.apiKey)
        }
    }

    /// The sync server URL (e.g., "https://gecko.dev.hexly.ai").
    @Published var syncServerUrl: String {
        didSet {
            defaults.set(syncServerUrl, forKey: Keys.syncServerUrl)
        }
    }

    /// The start_time watermark of the last successfully synced session.
    @Published var lastSyncedStartTime: Double {
        didSet {
            defaults.set(lastSyncedStartTime, forKey: Keys.lastSyncedStartTime)
        }
    }

    // MARK: - Init

    init() {
        self.defaults = .standard
        self.databasePath = UserDefaults.standard.string(forKey: Keys.databasePath)
            ?? Self.defaultDatabasePath
        self.syncEnabled = UserDefaults.standard.bool(forKey: Keys.syncEnabled)
        self.apiKey = UserDefaults.standard.string(forKey: Keys.apiKey) ?? ""
        self.syncServerUrl = UserDefaults.standard.string(forKey: Keys.syncServerUrl)
            ?? Self.defaultSyncServerUrl
        self.lastSyncedStartTime = UserDefaults.standard.double(forKey: Keys.lastSyncedStartTime)
    }

    /// For testing: init with a custom UserDefaults suite.
    init(defaults: UserDefaults, defaultPath: String? = nil) {
        self.defaults = defaults
        self.databasePath = defaults.string(forKey: Keys.databasePath)
            ?? defaultPath
            ?? Self.defaultDatabasePath
        self.syncEnabled = defaults.bool(forKey: Keys.syncEnabled)
        self.apiKey = defaults.string(forKey: Keys.apiKey) ?? ""
        self.syncServerUrl = defaults.string(forKey: Keys.syncServerUrl)
            ?? Self.defaultSyncServerUrl
        self.lastSyncedStartTime = defaults.double(forKey: Keys.lastSyncedStartTime)
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

    /// Whether sync is properly configured (has both an API key and server URL).
    var isSyncConfigured: Bool {
        syncEnabled && !apiKey.isEmpty && !syncServerUrl.isEmpty
    }

    /// Reset sync watermark to re-sync all data from the beginning.
    func resetSyncState() {
        lastSyncedStartTime = 0
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
