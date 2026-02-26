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
        XCTAssertTrue(path.contains("com.gecko.app"), "Default path should contain bundle ID directory")
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
}
