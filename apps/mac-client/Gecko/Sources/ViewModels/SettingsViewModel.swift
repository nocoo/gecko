import Foundation
import Combine

/// ViewModel for the settings view.
///
/// Owns editing state, validation flow, and save/reset actions.
/// Decouples SettingsView from SettingsManager's internal implementation.
@MainActor
final class SettingsViewModel: ObservableObject {

    // MARK: - Database Path State

    /// The path currently being edited in the text field.
    @Published var editingPath: String = ""

    /// Whether validation failed on the last save attempt.
    @Published private(set) var showValidationError: Bool = false

    /// Whether the editing path differs from the persisted path.
    @Published private(set) var isEditing: Bool = false

    /// Whether a custom (non-default) path is active.
    @Published private(set) var isCustomPath: Bool = false

    // MARK: - Sync State

    /// Whether sync is enabled (bound to toggle).
    @Published var syncEnabled: Bool = false {
        didSet {
            settingsManager.syncEnabled = syncEnabled
        }
    }

    /// The API key being edited.
    @Published var editingApiKey: String = ""

    /// The sync server URL being edited.
    @Published var editingSyncServerUrl: String = ""

    /// Whether sync settings have unsaved changes.
    var isSyncEditing: Bool {
        editingApiKey != settingsManager.apiKey
            || editingSyncServerUrl != settingsManager.syncServerUrl
    }

    /// Validation error for the sync server URL, if any.
    @Published var syncUrlValidationError: String?

    /// Whether to auto-start tracking on launch (bound to toggle).
    @Published var autoStartTracking: Bool = false {
        didSet {
            settingsManager.autoStartTracking = autoStartTracking
        }
    }

    /// Whether the app should launch at macOS login (bound to toggle).
    /// Reads/writes directly through SettingsManager → SMAppService.
    var launchAtLogin: Bool {
        get { settingsManager.launchAtLogin }
        set {
            objectWillChange.send()
            settingsManager.launchAtLogin = newValue
        }
    }

    // MARK: - Sync Service State (read-only, forwarded from SyncService)

    /// Current sync status from SyncService.
    @Published private(set) var syncStatus: SyncService.SyncStatus = .idle

    /// Last sync error message.
    @Published private(set) var syncLastError: String?

    /// Timestamp of last successful sync.
    @Published private(set) var syncLastTime: Date?

    /// Number of sessions synced in last batch.
    @Published private(set) var syncLastCount: Int = 0

    // MARK: - Dependencies

    private let settingsManager: SettingsManager
    private var syncService: SyncService?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init(settingsManager: SettingsManager, syncService: SyncService? = nil) {
        self.settingsManager = settingsManager
        self.syncService = syncService

        // Database path state
        self.editingPath = settingsManager.databasePath
        self.isCustomPath = settingsManager.isCustomPath

        // Sync state
        self.syncEnabled = settingsManager.syncEnabled
        self.editingApiKey = settingsManager.apiKey
        self.editingSyncServerUrl = settingsManager.syncServerUrl

        // Auto-start tracking
        self.autoStartTracking = settingsManager.autoStartTracking

        // Observe SyncService state
        bindSyncService()
    }

    // MARK: - SyncService Binding

    private func bindSyncService() {
        guard let syncService else { return }

        syncService.$status
            .receive(on: DispatchQueue.main)
            .assign(to: &$syncStatus)

        syncService.$lastError
            .receive(on: DispatchQueue.main)
            .assign(to: &$syncLastError)

        syncService.$lastSyncTime
            .receive(on: DispatchQueue.main)
            .assign(to: &$syncLastTime)

        syncService.$lastSyncCount
            .receive(on: DispatchQueue.main)
            .assign(to: &$syncLastCount)
    }

    /// Update the sync service reference (called after GeckoApp creates it).
    func setSyncService(_ service: SyncService) {
        self.syncService = service
        bindSyncService()
    }

    // MARK: - Database Path Actions

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

    // MARK: - Sync Actions

    /// Save the sync settings (API key and server URL).
    /// Returns false if the server URL fails validation.
    @discardableResult
    func saveSyncSettings() -> Bool {
        // Validate URL is HTTPS
        let url = editingSyncServerUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: url),
              parsed.scheme?.lowercased() == "https" else {
            syncUrlValidationError = "Server URL must use https://."
            return false
        }
        syncUrlValidationError = nil

        settingsManager.apiKey = editingApiKey
        settingsManager.syncServerUrl = url
        return true
    }

    /// Reset sync settings to defaults.
    ///
    /// Order matters: we ask SyncService to clear the per-row synced_at state
    /// first. If a cycle is in flight it refuses (returns false) and we bail
    /// without touching settings — leaving the user's API key / URL intact so
    /// they can retry once the cycle finishes. Without this guard the UI
    /// button being disabled by `canResetSyncSettings` is the only thing
    /// stopping us from desyncing settings vs DB state.
    @discardableResult
    func resetSyncSettings() -> Bool {
        if let syncService {
            guard syncService.resetSyncState() else { return false }
        } else {
            // No SyncService wired (e.g. unit tests). Fall back to the
            // legacy settings-only reset; callers in this path are
            // responsible for any DB-level cleanup.
            settingsManager.resetSyncState()
        }

        settingsManager.apiKey = ""
        settingsManager.syncServerUrl = SettingsManager.defaultSyncServerUrl
        settingsManager.syncEnabled = false

        editingApiKey = ""
        editingSyncServerUrl = SettingsManager.defaultSyncServerUrl
        syncEnabled = false
        return true
    }

    /// Trigger an immediate sync.
    func syncNow() async {
        await syncService?.syncNow()
    }

    /// Whether the sync now button should be enabled.
    var canSyncNow: Bool {
        settingsManager.isSyncConfigured && syncStatus != .syncing
    }

    /// Whether the Reset Sync Settings button should be enabled.
    ///
    /// Disabled mid-sync because resetSyncState would clear synced_at on every
    /// row, but an in-flight drainBatches that has already fetched a batch
    /// would still mark those ids back to synced after the reset — leaving
    /// those rows skipped instead of re-uploaded. Waiting until the cycle
    /// finishes avoids the race entirely.
    var canResetSyncSettings: Bool {
        syncStatus != .syncing
    }

    /// Whether sync save button should be enabled.
    var canSaveSyncSettings: Bool {
        isSyncEditing
    }
}
