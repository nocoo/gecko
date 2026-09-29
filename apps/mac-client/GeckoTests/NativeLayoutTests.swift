import AppKit
import SwiftUI
import XCTest
@testable import Gecko

@MainActor
final class NativeLayoutTests: XCTestCase {
    func testWorkspacePagesInBothAppearances() async throws {
        let database = try DatabaseManager.makeInMemory()
        for (index, name) in ["Safari", "Xcode", "Terminal", "Finder", "Notes", "Safari"].enumerated() {
            var session = Self.session
            session.id = "design-session-\(index)"
            session.appName = name
            session.bundleId = ["com.apple.Safari", "com.apple.dt.Xcode", "com.apple.Terminal",
                                "com.apple.finder", "com.apple.Notes", "com.apple.Safari"][index]
            session.startTime -= Double(index * 600)
            session.endTime = session.startTime + session.duration
            try database.insert(session)
        }
        let sessions = SessionListViewModel(db: database)
        let suite = "ai.hexly.gecko.layout-tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let manager = SettingsManager(defaults: defaults, defaultPath: "/Users/preview/Gecko/gecko.sqlite")
        let settings = SettingsViewModel(settingsManager: manager)
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(sessions.sessionCount, 6)

        for scheme in [ColorScheme.light, .dark] {
            try await capture("tracking-\(scheme)", scheme: scheme) {
                workspace(.tracking) { tracking(active: true, granted: true) }
            }
            try await capture("permissions-compact-\(scheme)", scheme: scheme,
                              width: GeckoTheme.minimumWidth, height: GeckoTheme.minimumHeight) {
                workspace(.tracking, isTracking: false) { tracking(active: false, granted: false) }
            }
            try await capture("sessions-\(scheme)", scheme: scheme) {
                workspace(.sessions) { SessionListView(viewModel: sessions) }
            }
            try await capture("settings-\(scheme)", scheme: scheme) {
                workspace(.settings) { SettingsView(viewModel: settings) }
            }
            try await capture("settings-compact-\(scheme)", scheme: scheme,
                              width: GeckoTheme.minimumWidth, height: GeckoTheme.minimumHeight) {
                workspace(.settings) { SettingsView(viewModel: settings) }
            }
            try await capture("about-\(scheme)", scheme: scheme) {
                workspace(.about) { AboutView() }
            }
            try await capture("menu-\(scheme)", scheme: scheme, width: 320, height: 460) {
                GeckoMenuContent(
                    isTracking: true, appName: Self.session.appName, windowTitle: Self.session.windowTitle,
                    permissionsGranted: false, onToggle: {}, onNavigate: { _ in }, onQuit: {}
                )
            }
        }
    }

    func testEmptySessionsAndConnectionValidation() async throws {
        let sessions = SessionListViewModel(db: try DatabaseManager.makeInMemory())
        try await capture("empty-sessions", scheme: .light,
                          width: GeckoTheme.minimumWidth, height: GeckoTheme.minimumHeight) {
            workspace(.sessions) { SessionListView(viewModel: sessions) }
        }
        let suite = "ai.hexly.gecko.layout-tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let manager = SettingsManager(defaults: defaults, defaultPath: "/Users/preview/Gecko/gecko.sqlite")
        let settings = SettingsViewModel(settingsManager: manager)
        settings.editingSyncServerUrl = "http://example.invalid"
        XCTAssertFalse(settings.saveSyncSettings())
        try await capture("connection-validation", scheme: .light, width: 620, height: 460) {
            SettingsSyncView(viewModel: settings).padding(24).background(GeckoTheme.canvas)
        }
        XCTAssertNotNil(settings.syncUrlValidationError)
    }

    func testSessionsAtMinimumWindowSize() async throws {
        let database = try DatabaseManager.makeInMemory()
        var session = Self.session
        session.windowTitle = String(repeating: "A long window title with multiple words — ", count: 8)
        session.url = "https://example.invalid/" + String(repeating: "long-path-segment/", count: 20)
        try database.insert(session)
        let sessions = SessionListViewModel(db: database)
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(sessions.sessionCount, 1)
        for scheme in [ColorScheme.light, .dark] {
            try await capture("sessions-compact-\(scheme)", scheme: scheme,
                              width: GeckoTheme.minimumWidth, height: GeckoTheme.minimumHeight) {
                workspace(.sessions) { SessionListView(viewModel: sessions) }
            }
        }
    }

    private func workspace<Content: View>(
        _ page: TabIdentifier, isTracking: Bool = true, @ViewBuilder content: () -> Content
    ) -> some View {
        GeckoWorkspace(selection: .constant(page), isTracking: isTracking, onToggleTracking: {}, content: content)
    }

    private func tracking(active: Bool, granted: Bool) -> some View {
        TrackingContent(
            isTracking: active, session: active ? Self.session : nil,
            accessibilityGranted: granted, automationGranted: granted,
            onToggle: {}, onRequestAccessibility: {}, onOpenAccessibility: {},
            onRequestAutomation: {}, onOpenAutomation: {}
        )
    }

    private func capture<Content: View>(
        _ name: String, scheme: ColorScheme,
        width: CGFloat = GeckoTheme.defaultWidth, height: CGFloat = GeckoTheme.defaultHeight,
        @ViewBuilder content: () -> Content
    ) async throws {
        let root = content().environment(\.colorScheme, scheme).environment(\.controlActiveState, .active)
            .font(GeckoTheme.body).foregroundStyle(GeckoTheme.ink).tint(GeckoTheme.accent)
        let host = NSHostingView(rootView: root.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading))
        host.sizingOptions = []
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false
        )
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
        window.contentView = host
        window.setContentSize(NSSize(width: width, height: height))
        window.orderFront(nil)
        defer { window.close() }
        try await Task.sleep(for: .milliseconds(120))
        host.layoutSubtreeIfNeeded()
        XCTAssertEqual(host.bounds.width, width, accuracy: 1, name)
        XCTAssertEqual(host.bounds.height, height, accuracy: 1, name)
        verifySplitViews(host, in: host)
        let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let png = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
        XCTAssertGreaterThan(png.count, 2000, "\(name) must render visible content")
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func verifySplitViews(_ view: NSView, in host: NSView) {
        if let split = view as? NSSplitView {
            for column in split.arrangedSubviews where !column.isHidden {
                let frame = column.convert(column.bounds, to: host)
                XCTAssertGreaterThan(frame.width, 0)
                XCTAssertGreaterThanOrEqual(frame.minX, -1)
                XCTAssertLessThanOrEqual(frame.maxX, host.bounds.maxX + 1)
            }
        }
        for child in view.subviews { verifySplitViews(child, in: host) }
    }

    private static var session: FocusSession {
        FocusSession(
            id: "design-session", appName: "Safari", bundleId: "com.apple.Safari",
            windowTitle: "Designing a calmer workspace — Gecko project notes and visual references",
            url: "https://example.invalid/gecko/design-notes", tabCount: 8,
            isFullScreen: false, isMinimized: false,
            startTime: 1790622000, endTime: 1790622240, duration: 240
        )
    }
}
