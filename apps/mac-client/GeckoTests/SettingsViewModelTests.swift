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
}
