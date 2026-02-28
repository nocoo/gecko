import XCTest
@testable import Gecko

@MainActor
final class SettingsViewModelTests: XCTestCase {

    // MARK: - Helpers

    private func makeSettingsManager() -> SettingsManager {
        let suiteName = "com.gecko.test.\(UUID().uuidString)"
        // swiftlint:disable:next force_unwrapping
        let defaults = UserDefaults(suiteName: suiteName)!
        return SettingsManager(defaults: defaults)
    }

    // MARK: - Init

    func testInitLoadsCurrentPath() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)
        XCTAssertEqual(viewModel.editingPath, manager.databasePath)
        XCTAssertFalse(viewModel.isEditing)
        XCTAssertFalse(viewModel.showValidationError)
    }

    func testInitReflectsCustomPathStatus() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)
        // Default path should not be custom
        XCTAssertFalse(viewModel.isCustomPath)
    }

    // MARK: - Editing state

    func testOnPathChangedSetsIsEditing() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingPath = "/tmp/new-path.sqlite"
        viewModel.onPathChanged()

        XCTAssertTrue(viewModel.isEditing)
        XCTAssertTrue(viewModel.canSave)
    }

    func testOnPathChangedClearsValidationError() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        // Force a validation error by saving an invalid path
        viewModel.editingPath = "/nonexistent/deeply/nested/impossible/path/db.sqlite"
        viewModel.onPathChanged()

        // The validation error flag should be cleared on path change
        XCTAssertFalse(viewModel.showValidationError)
    }

    func testRevertingPathClearsIsEditing() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)
        let originalPath = viewModel.editingPath

        viewModel.editingPath = "/tmp/different.sqlite"
        viewModel.onPathChanged()
        XCTAssertTrue(viewModel.isEditing)

        viewModel.editingPath = originalPath
        viewModel.onPathChanged()
        XCTAssertFalse(viewModel.isEditing)
    }

    // MARK: - Save

    func testSaveValidPathSucceeds() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        let newPath = "/tmp/gecko-test-\(UUID().uuidString).sqlite"
        viewModel.editingPath = newPath
        viewModel.onPathChanged()

        let result = viewModel.save()

        XCTAssertTrue(result)
        XCTAssertFalse(viewModel.isEditing)
        XCTAssertFalse(viewModel.showValidationError)
        XCTAssertEqual(manager.databasePath, newPath)
    }

    func testSaveInvalidPathFails() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)
        let originalPath = manager.databasePath

        // Path with nonexistent parent that cannot be created
        viewModel.editingPath = "/nonexistent-root-\(UUID().uuidString)/deeply/nested/db.sqlite"
        viewModel.onPathChanged()

        let result = viewModel.save()

        XCTAssertFalse(result)
        XCTAssertTrue(viewModel.showValidationError)
        XCTAssertEqual(manager.databasePath, originalPath, "Path should not change on failed save")
    }

    func testSaveUpdatesIsCustomPath() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertFalse(viewModel.isCustomPath)

        let customPath = "/tmp/gecko-custom-\(UUID().uuidString).sqlite"
        viewModel.editingPath = customPath
        viewModel.onPathChanged()
        viewModel.save()

        XCTAssertTrue(viewModel.isCustomPath)
    }

    // MARK: - Reset

    func testResetToDefault() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        // Set a custom path first
        let customPath = "/tmp/gecko-reset-test-\(UUID().uuidString).sqlite"
        viewModel.editingPath = customPath
        viewModel.onPathChanged()
        viewModel.save()

        XCTAssertTrue(viewModel.isCustomPath)

        // Reset
        viewModel.resetToDefault()

        XCTAssertFalse(viewModel.isCustomPath)
        XCTAssertFalse(viewModel.isEditing)
        XCTAssertFalse(viewModel.showValidationError)
        XCTAssertEqual(viewModel.editingPath, SettingsManager.defaultDatabasePath)
    }

    // MARK: - setPath

    func testSetPathUpdatesEditingState() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.setPath("/tmp/from-browser.sqlite")

        XCTAssertEqual(viewModel.editingPath, "/tmp/from-browser.sqlite")
        XCTAssertTrue(viewModel.isEditing)
    }

    // MARK: - canReset

    func testCanResetWhenCustomPath() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        // Default: can't reset
        XCTAssertFalse(viewModel.canReset)

        // Set custom path
        viewModel.editingPath = "/tmp/gecko-canreset-\(UUID().uuidString).sqlite"
        viewModel.onPathChanged()
        viewModel.save()

        XCTAssertTrue(viewModel.canReset)
    }

    func testCanResetWhenEditing() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertFalse(viewModel.canReset)

        viewModel.editingPath = "/tmp/something.sqlite"
        viewModel.onPathChanged()

        XCTAssertTrue(viewModel.canReset)
    }

    // MARK: - Sync State Init

    func testSyncStateInitFromSettings() {
        let manager = makeSettingsManager()
        manager.syncEnabled = true
        manager.apiKey = "gk_abc123"
        manager.syncServerUrl = "https://test.example.com"

        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertTrue(viewModel.syncEnabled)
        XCTAssertEqual(viewModel.editingApiKey, "gk_abc123")
        XCTAssertEqual(viewModel.editingSyncServerUrl, "https://test.example.com")
    }

    func testSyncStateDefaultsWhenNotConfigured() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertFalse(viewModel.syncEnabled)
        XCTAssertEqual(viewModel.editingApiKey, "")
        XCTAssertEqual(viewModel.editingSyncServerUrl, SettingsManager.defaultSyncServerUrl)
        XCTAssertFalse(viewModel.isSyncEditing)
    }

    // MARK: - Sync Editing State

    func testChangingApiKeySetsIsSyncEditing() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_new_key"

        XCTAssertTrue(viewModel.isSyncEditing)
    }

    func testChangingSyncServerUrlSetsIsSyncEditing() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingSyncServerUrl = "https://new-server.com"

        XCTAssertTrue(viewModel.isSyncEditing)
    }

    func testRevertingApiKeyClearsIsSyncEditing() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_temporary"
        XCTAssertTrue(viewModel.isSyncEditing)

        viewModel.editingApiKey = ""
        XCTAssertFalse(viewModel.isSyncEditing)
    }

    // MARK: - Save Sync Settings

    func testSaveSyncSettingsPersists() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_save_test"
        viewModel.editingSyncServerUrl = "https://saved.example.com"
        viewModel.saveSyncSettings()

        XCTAssertEqual(manager.apiKey, "gk_save_test")
        XCTAssertEqual(manager.syncServerUrl, "https://saved.example.com")
        XCTAssertFalse(viewModel.isSyncEditing)
    }

    // MARK: - Sync URL HTTPS Validation

    func testSaveSyncSettingsRejectsHttpUrl() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_test"
        viewModel.editingSyncServerUrl = "http://insecure.example.com"

        let result = viewModel.saveSyncSettings()

        XCTAssertFalse(result)
        XCTAssertEqual(viewModel.syncUrlValidationError, "Server URL must use https://.")
        XCTAssertEqual(manager.syncServerUrl, SettingsManager.defaultSyncServerUrl,
                       "Settings should not be saved when URL validation fails")
    }

    func testSaveSyncSettingsRejectsInvalidUrl() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_test"
        viewModel.editingSyncServerUrl = "not a url at all"

        let result = viewModel.saveSyncSettings()

        XCTAssertFalse(result)
        XCTAssertNotNil(viewModel.syncUrlValidationError)
    }

    func testSaveSyncSettingsAcceptsHttpsUrl() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_test"
        viewModel.editingSyncServerUrl = "https://secure.example.com"

        let result = viewModel.saveSyncSettings()

        XCTAssertTrue(result)
        XCTAssertNil(viewModel.syncUrlValidationError)
        XCTAssertEqual(manager.syncServerUrl, "https://secure.example.com")
    }

    func testSaveSyncSettingsClearsErrorOnSuccess() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        // First: trigger an error with HTTP
        viewModel.editingApiKey = "gk_test"
        viewModel.editingSyncServerUrl = "http://bad.com"
        viewModel.saveSyncSettings()
        XCTAssertNotNil(viewModel.syncUrlValidationError)

        // Then: fix to HTTPS and save again
        viewModel.editingSyncServerUrl = "https://good.com"
        let result = viewModel.saveSyncSettings()

        XCTAssertTrue(result)
        XCTAssertNil(viewModel.syncUrlValidationError)
    }

    func testSaveSyncSettingsTrimsWhitespace() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        viewModel.editingApiKey = "gk_test"
        viewModel.editingSyncServerUrl = "  https://trimmed.example.com  "

        let result = viewModel.saveSyncSettings()

        XCTAssertTrue(result)
        XCTAssertEqual(manager.syncServerUrl, "https://trimmed.example.com")
    }

    // MARK: - Reset Sync Settings

    func testResetSyncSettingsRestoresDefaults() {
        let manager = makeSettingsManager()
        manager.syncEnabled = true
        manager.apiKey = "gk_to_reset"
        manager.syncServerUrl = "https://custom.com"
        manager.lastSyncedStartTime = 9999.0

        let viewModel = SettingsViewModel(settingsManager: manager)
        viewModel.resetSyncSettings()

        XCTAssertFalse(viewModel.syncEnabled)
        XCTAssertEqual(viewModel.editingApiKey, "")
        XCTAssertEqual(viewModel.editingSyncServerUrl, SettingsManager.defaultSyncServerUrl)
        XCTAssertFalse(viewModel.isSyncEditing)
        XCTAssertEqual(manager.lastSyncedStartTime, 0)
    }

    // MARK: - Sync Enable Toggle

    func testSyncEnableToggleUpdatesManager() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertFalse(manager.syncEnabled)

        viewModel.syncEnabled = true
        XCTAssertTrue(manager.syncEnabled)

        viewModel.syncEnabled = false
        XCTAssertFalse(manager.syncEnabled)
    }

    // MARK: - canSyncNow

    func testCanSyncNowWhenConfigured() {
        let manager = makeSettingsManager()
        manager.syncEnabled = true
        manager.apiKey = "gk_test"
        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertTrue(viewModel.canSyncNow)
    }

    func testCanSyncNowFalseWhenNotConfigured() {
        let manager = makeSettingsManager()
        let viewModel = SettingsViewModel(settingsManager: manager)

        XCTAssertFalse(viewModel.canSyncNow)
    }
}
