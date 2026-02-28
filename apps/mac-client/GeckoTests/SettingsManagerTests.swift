import XCTest
@testable import Gecko

@MainActor
final class SettingsManagerTests: XCTestCase {

    private var suiteName: String = ""
    private var defaults: UserDefaults! // swiftlint:disable:this implicitly_unwrapped_optional

    override func setUp() {
        suiteName = "com.gecko.test.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        UserDefaults.standard.removePersistentDomain(forName: suiteName)
        defaults = nil
    }

    // MARK: - Default Path

    func testDefaultPathUsedWhenNoCustomPathSet() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager.databasePath, SettingsManager.defaultDatabasePath)
    }

    func testDefaultPathIsNotCustom() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertFalse(manager.isCustomPath)
    }

    func testDefaultPathContainsGeckoSqlite() {
        let path = SettingsManager.defaultDatabasePath
        XCTAssertTrue(path.contains("gecko.sqlite"), "Default path should contain gecko.sqlite")
        XCTAssertTrue(path.contains("ai.hexly.gecko"), "Default path should contain bundle ID directory")
    }

    // MARK: - Custom Path

    func testSetCustomPath() {
        let manager = SettingsManager(defaults: defaults)
        manager.databasePath = "/tmp/test-gecko.sqlite"
        XCTAssertEqual(manager.databasePath, "/tmp/test-gecko.sqlite")
        XCTAssertTrue(manager.isCustomPath)
    }

    func testCustomPathPersistedToDefaults() {
        let manager = SettingsManager(defaults: defaults)
        manager.databasePath = "/tmp/custom-gecko.sqlite"

        // Create a new manager with the same defaults to verify persistence
        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager2.databasePath, "/tmp/custom-gecko.sqlite")
    }

    func testResetToDefault() {
        let manager = SettingsManager(defaults: defaults)
        manager.databasePath = "/tmp/custom-gecko.sqlite"
        XCTAssertTrue(manager.isCustomPath)

        manager.resetToDefault()
        XCTAssertFalse(manager.isCustomPath)
        XCTAssertEqual(manager.databasePath, SettingsManager.defaultDatabasePath)
    }

    // MARK: - Path Validation

    func testValidatePathWithExistingDirectory() {
        let manager = SettingsManager(defaults: defaults)
        // /tmp always exists
        XCTAssertTrue(manager.validatePath("/tmp/gecko-test.sqlite"))
    }

    func testValidatePathWithCreatableDirectory() {
        let manager = SettingsManager(defaults: defaults)
        let path = "/tmp/gecko-test-\(UUID().uuidString)/gecko.sqlite"
        XCTAssertTrue(manager.validatePath(path))

        // Clean up
        let dir = URL(fileURLWithPath: path).deletingLastPathComponent()
        try? FileManager.default.removeItem(at: dir)
    }

    func testValidatePathWithInvalidDirectory() {
        let manager = SettingsManager(defaults: defaults)
        // Root-level path that can't be created without privileges
        XCTAssertFalse(manager.validatePath("/nonexistent-root-dir/sub/gecko.sqlite"))
    }

    // MARK: - Init with custom default path

    func testInitWithCustomDefaultPath() {
        let manager = SettingsManager(defaults: defaults, defaultPath: "/custom/default.sqlite")
        XCTAssertEqual(manager.databasePath, "/custom/default.sqlite")
    }

    func testSavedPathTakesPrecedenceOverCustomDefault() {
        defaults.set("/saved/path.sqlite", forKey: "gecko.settings.databasePath")
        let manager = SettingsManager(defaults: defaults, defaultPath: "/custom/default.sqlite")
        XCTAssertEqual(manager.databasePath, "/saved/path.sqlite")
    }

    // MARK: - Sync Settings: Defaults

    func testSyncEnabledDefaultsToFalse() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertFalse(manager.syncEnabled)
    }

    func testApiKeyDefaultsToEmpty() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager.apiKey, "")
    }

    func testSyncServerUrlDefaultsToProduction() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager.syncServerUrl, SettingsManager.defaultSyncServerUrl)
    }

    func testLastSyncedStartTimeDefaultsToZero() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager.lastSyncedStartTime, 0)
    }

    // MARK: - Sync Settings: Persistence

    func testSyncEnabledPersistedToDefaults() {
        let manager = SettingsManager(defaults: defaults)
        manager.syncEnabled = true

        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertTrue(manager2.syncEnabled)
    }

    func testApiKeyPersistedToDefaults() {
        let manager = SettingsManager(defaults: defaults)
        manager.apiKey = "gk_test123"

        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager2.apiKey, "gk_test123")
    }

    func testSyncServerUrlPersistedToDefaults() {
        let manager = SettingsManager(defaults: defaults)
        manager.syncServerUrl = "https://custom.example.com"

        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager2.syncServerUrl, "https://custom.example.com")
    }

    func testLastSyncedStartTimePersistedToDefaults() {
        let manager = SettingsManager(defaults: defaults)
        manager.lastSyncedStartTime = 1234567.89

        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertEqual(manager2.lastSyncedStartTime, 1234567.89)
    }

    // MARK: - isSyncConfigured

    func testIsSyncConfiguredRequiresAllThree() {
        let manager = SettingsManager(defaults: defaults)

        // GIVEN: nothing configured
        XCTAssertFalse(manager.isSyncConfigured)

        // GIVEN: only enabled
        manager.syncEnabled = true
        XCTAssertFalse(manager.isSyncConfigured, "Needs API key too")

        // GIVEN: enabled + API key
        manager.apiKey = "gk_test"
        XCTAssertTrue(manager.isSyncConfigured, "Has enabled + key + default URL")

        // GIVEN: disabled
        manager.syncEnabled = false
        XCTAssertFalse(manager.isSyncConfigured, "Disabled = not configured")
    }

    func testIsSyncConfiguredWithEmptyServerUrl() {
        let manager = SettingsManager(defaults: defaults)
        manager.syncEnabled = true
        manager.apiKey = "gk_test"
        manager.syncServerUrl = ""
        XCTAssertFalse(manager.isSyncConfigured, "Empty server URL = not configured")
    }

    // MARK: - resetSyncState

    func testResetSyncStateResetsWatermark() {
        let manager = SettingsManager(defaults: defaults)
        manager.lastSyncedStartTime = 9999.0

        manager.resetSyncState()

        XCTAssertEqual(manager.lastSyncedStartTime, 0)
    }

    // MARK: - Auto-Start Tracking

    func testAutoStartTrackingDefaultsToFalse() {
        let manager = SettingsManager(defaults: defaults)
        XCTAssertFalse(manager.autoStartTracking)
    }

    func testAutoStartTrackingPersistedToDefaults() {
        let manager = SettingsManager(defaults: defaults)
        manager.autoStartTracking = true

        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertTrue(manager2.autoStartTracking)
    }

    func testAutoStartTrackingCanBeDisabled() {
        let manager = SettingsManager(defaults: defaults)
        manager.autoStartTracking = true
        manager.autoStartTracking = false

        let manager2 = SettingsManager(defaults: defaults)
        XCTAssertFalse(manager2.autoStartTracking)
    }
}
