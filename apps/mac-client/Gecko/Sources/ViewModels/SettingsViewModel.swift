import Foundation

/// ViewModel for the settings view.
///
/// Owns editing state, validation flow, and save/reset actions.
/// Decouples SettingsView from SettingsManager's internal implementation.
@MainActor
final class SettingsViewModel: ObservableObject {

    // MARK: - Published State

    /// The path currently being edited in the text field.
    @Published var editingPath: String = ""

    /// Whether validation failed on the last save attempt.
    @Published private(set) var showValidationError: Bool = false

    /// Whether the editing path differs from the persisted path.
    @Published private(set) var isEditing: Bool = false

    /// Whether a custom (non-default) path is active.
    @Published private(set) var isCustomPath: Bool = false

    // MARK: - Dependencies

    private let settingsManager: SettingsManager

    // MARK: - Init

    init(settingsManager: SettingsManager) {
        self.settingsManager = settingsManager
        self.editingPath = settingsManager.databasePath
        self.isCustomPath = settingsManager.isCustomPath
    }

    // MARK: - Public API

    /// Called when the editing path text changes.
    func onPathChanged() {
        isEditing = (editingPath != settingsManager.databasePath)
        showValidationError = false
    }

    /// Validate and save the current editing path.
    /// Returns true if save succeeded.
    @discardableResult
    func save() -> Bool {
        if settingsManager.validatePath(editingPath) {
            settingsManager.databasePath = editingPath
            isEditing = false
            showValidationError = false
            isCustomPath = settingsManager.isCustomPath
            return true
        } else {
            showValidationError = true
            return false
        }
    }

    /// Reset to the default database path.
    func resetToDefault() {
        settingsManager.resetToDefault()
        editingPath = settingsManager.databasePath
        isEditing = false
        showValidationError = false
        isCustomPath = settingsManager.isCustomPath
    }

    /// Whether the save button should be enabled.
    var canSave: Bool {
        isEditing
    }

    /// Whether the reset button should be enabled.
    var canReset: Bool {
        isCustomPath || isEditing
    }

    /// Update the editing path from an external source (e.g., file browser panel).
    func setPath(_ path: String) {
        editingPath = path
        onPathChanged()
    }
}
