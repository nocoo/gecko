import SwiftUI
import Combine

@main
struct GeckoApp: App {
    // MARK: - Services (internal, not passed to views directly)
    @StateObject private var permissionManager = PermissionManager()
    @StateObject private var trackingEngine = TrackingEngine()
    @StateObject private var settingsManager = SettingsManager()
    @StateObject private var tabSelection = TabSelection()
    @StateObject private var syncService: SyncService

    // MARK: - ViewModels
    @StateObject private var trackingViewModel: TrackingViewModel
    @StateObject private var menuBarViewModel: MenuBarViewModel
    @StateObject private var sessionListViewModel: SessionListViewModel
    @StateObject private var settingsViewModel: SettingsViewModel

    init() {
        let permission = PermissionManager()
        let engine = TrackingEngine()
        let settings = SettingsManager()
        let tab = TabSelection()

        // One-time backfill for users upgrading from the watermark-based scheme
        // (pre-v3 migration). Mark every row at or before lastSyncedStartTime as
        // already synced so per-row resumable sync doesn't retransmit them. The
        // method itself is idempotent — it bails when any row already carries
        // synced_at, so fresh installs and subsequent launches are no-ops.
        if settings.lastSyncedStartTime > 0 {
            let now = Date().timeIntervalSince1970
            let watermark = settings.lastSyncedStartTime
            _ = try? DatabaseManager.shared.backfillSyncedFromWatermark(
                throughStartTime: watermark,
                at: now
            )
        }

        let sync = SyncService(db: DatabaseManager.shared, settings: settings)

        _permissionManager = StateObject(wrappedValue: permission)
        _trackingEngine = StateObject(wrappedValue: engine)
        _settingsManager = StateObject(wrappedValue: settings)
        _tabSelection = StateObject(wrappedValue: tab)
        _syncService = StateObject(wrappedValue: sync)

        _trackingViewModel = StateObject(
            wrappedValue: TrackingViewModel(
                trackingEngine: engine,
                permissionManager: permission
            )
        )
        _menuBarViewModel = StateObject(
            wrappedValue: MenuBarViewModel(
                trackingEngine: engine,
                permissionManager: permission
            )
        )
        _sessionListViewModel = StateObject(
            wrappedValue: SessionListViewModel(db: DatabaseManager.shared)
        )
        _settingsViewModel = StateObject(
            wrappedValue: SettingsViewModel(settingsManager: settings, syncService: sync)
        )

        Task { @MainActor in
            await Self.waitForPermissionsAndStart(
                settings: settings, engine: engine, permission: permission
            )
        }
    }

    var body: some Scene {
        // Main window with tabbed layout
        Window("Gecko", id: "main") {
            MainWindowView(
                trackingViewModel: trackingViewModel,
                sessionListViewModel: sessionListViewModel,
                settingsViewModel: settingsViewModel,
                tabSelection: tabSelection
            )
            .task {
                await autoStartTrackingIfNeeded()
            }
        }
        .defaultSize(width: 700, height: 600)

        // Menu bar icon — always visible
        MenuBarExtra("Gecko", image: "MenuBarIcon") {
            MenuBarView(
                viewModel: menuBarViewModel,
                tabSelection: tabSelection
            )
            .task {
                await autoStartTrackingIfNeeded()
            }
        }

        // Native macOS Settings window (Cmd+,)
        Settings {
            SettingsView(viewModel: settingsViewModel)
                .frame(minWidth: 500, idealWidth: 600, minHeight: 400, idealHeight: 500)
        }
    }

    // MARK: - Auto-Start

    @MainActor
    private static func waitForPermissionsAndStart(
        settings: SettingsManager, engine: TrackingEngine, permission: PermissionManager
    ) async {
        try? await Task.sleep(for: .milliseconds(500))

        for await (ax, auto, autoStart, tracking) in permission.$isAccessibilityGranted
            .combineLatest(
                permission.$isAutomationGranted,
                settings.$autoStartTracking,
                engine.$isTracking
            )
            .values {
            guard autoStart, !tracking else { return }
            if ax && auto {
                engine.start()
                return
            }
        }
    }

    @MainActor
    private func autoStartTrackingIfNeeded() async {
        guard settingsManager.autoStartTracking else { return }
        guard !trackingEngine.isTracking else { return }
        if permissionManager.allPermissionsGranted {
            trackingEngine.start()
        }
    }
}
