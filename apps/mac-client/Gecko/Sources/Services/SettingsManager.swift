import Foundation
import Security
import ServiceManagement

// MARK: - Keychain Helper

/// Minimal Keychain wrapper for storing sensitive strings (e.g. API keys).
/// Uses kSecClassGenericPassword with a fixed service identifier.
enum KeychainHelper {
    private static let service = "ai.hexly.gecko"

    /// Save a string to the Keychain under the given account key.
    static func save(_ value: String, forKey account: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]

        // Delete any existing entry first
        SecItemDelete(query as CFDictionary)

        // Only store if value is non-empty
        guard !value.isEmpty else { return }

        var addQuery = query
        addQuery[kSecValueData as String] = data
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    /// Load a string from the Keychain for the given account key.
    static func load(forKey account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    /// Delete a Keychain entry for the given account key.
    static func delete(forKey account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// Manages user-configurable settings persisted via UserDefaults.
/// API keys are stored in the macOS Keychain for security.
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
        static let autoStartTracking = "gecko.settings.autoStartTracking"
    }

    // MARK: - Defaults

    static let defaultSyncServerUrl = "https://gecko.dev.hexly.ai"

    // MARK: - Storage

    private let defaults: UserDefaults

    /// When true, API key is stored in UserDefaults instead of Keychain (for testing).
    private let useKeychainForApiKey: Bool

    /// When false, launchAtLogin is a no-op (used in test environments where
    /// SMAppService is unavailable).
    private let useSMAppService: Bool

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
    /// Stored in macOS Keychain (or UserDefaults for tests).
    @Published var apiKey: String {
        didSet {
            if useKeychainForApiKey {
                KeychainHelper.save(apiKey, forKey: Keys.apiKey)
            } else {
                defaults.set(apiKey, forKey: Keys.apiKey)
            }
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

    /// Whether to automatically start tracking on launch (when permissions are granted).
    @Published var autoStartTracking: Bool {
        didSet {
            defaults.set(autoStartTracking, forKey: Keys.autoStartTracking)
        }
    }

    /// Whether the app should launch at macOS login.
    /// Backed by SMAppService (system-managed), not UserDefaults.
    /// Returns false and is a no-op in test environments.
    var launchAtLogin: Bool {
        get {
            guard useSMAppService else { return false }
            return SMAppService.mainApp.status == .enabled
        }
        set {
            guard useSMAppService else { return }
            objectWillChange.send()
            do {
                if newValue {
                    try SMAppService.mainApp.register()
                } else {
                    try SMAppService.mainApp.unregister()
                }
            } catch {
                // Registration can fail if the user denied in System Settings.
                // The toggle will revert on next read since we query live status.
                print("[SettingsManager] Launch at login \(newValue ? "register" : "unregister") failed: \(error)")
            }
        }
    }

    // MARK: - Init

    init() {
        self.defaults = .standard
        self.useKeychainForApiKey = true
        self.useSMAppService = true
        self.databasePath = UserDefaults.standard.string(forKey: Keys.databasePath)
            ?? Self.defaultDatabasePath
        self.syncEnabled = UserDefaults.standard.bool(forKey: Keys.syncEnabled)
        self.syncServerUrl = UserDefaults.standard.string(forKey: Keys.syncServerUrl)
            ?? Self.defaultSyncServerUrl
        self.lastSyncedStartTime = UserDefaults.standard.double(forKey: Keys.lastSyncedStartTime)
        self.autoStartTracking = UserDefaults.standard.bool(forKey: Keys.autoStartTracking)

        // Load API key from Keychain, migrating from UserDefaults if needed
        if let keychainKey = KeychainHelper.load(forKey: Keys.apiKey), !keychainKey.isEmpty {
            self.apiKey = keychainKey
        } else if let legacyKey = UserDefaults.standard.string(forKey: Keys.apiKey), !legacyKey.isEmpty {
            // Migrate from UserDefaults to Keychain
            self.apiKey = legacyKey
            KeychainHelper.save(legacyKey, forKey: Keys.apiKey)
            UserDefaults.standard.removeObject(forKey: Keys.apiKey)
        } else {
            self.apiKey = ""
        }
    }

    /// For testing: init with a custom UserDefaults suite (API key stays in UserDefaults).
    init(defaults: UserDefaults, defaultPath: String? = nil) {
        self.defaults = defaults
        self.useKeychainForApiKey = false
        self.useSMAppService = false
        self.databasePath = defaults.string(forKey: Keys.databasePath)
            ?? defaultPath
            ?? Self.defaultDatabasePath
        self.syncEnabled = defaults.bool(forKey: Keys.syncEnabled)
        self.apiKey = defaults.string(forKey: Keys.apiKey) ?? ""
        self.syncServerUrl = defaults.string(forKey: Keys.syncServerUrl)
            ?? Self.defaultSyncServerUrl
        self.lastSyncedStartTime = defaults.double(forKey: Keys.lastSyncedStartTime)
        self.autoStartTracking = defaults.bool(forKey: Keys.autoStartTracking)
    }

    // MARK: - Default Path

    /// The default database path: ~/Library/Application Support/ai.hexly.gecko/gecko.sqlite
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

    /// Reset only the legacy `lastSyncedStartTime` watermark. Kept for
    /// diagnostic UI/tests and as a fallback; the authoritative reset is
    /// `SyncService.resetSyncState()`, which also clears `synced_at` on
    /// every row so the next cycle re-uploads everything.
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
