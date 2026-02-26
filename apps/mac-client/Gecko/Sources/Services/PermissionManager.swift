import Cocoa
import Combine

/// Manages checking and requesting macOS permissions required by Gecko.
///
/// Two permissions are critical:
/// - **Accessibility**: Required for AXUIElement to read window titles.
/// - **Automation (Apple Events)**: Required for NSAppleScript to grab browser URLs.
@MainActor
final class PermissionManager: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isAccessibilityGranted: Bool = false
    @Published private(set) var isAutomationGranted: Bool = false

    var allPermissionsGranted: Bool {
        isAccessibilityGranted && isAutomationGranted
    }

    // MARK: - Private

    private var pollTimer: Timer?

    // MARK: - Lifecycle

    init() {
        refreshAll()
        startPolling()
    }

    deinit {
        pollTimer?.invalidate()
    }

    // MARK: - Public API

    /// Re-check all permission statuses.
    func refreshAll() {
        checkAccessibility()
        checkAutomation()
    }

    /// Prompt the system Accessibility dialog (one-shot) and open System Settings.
    func requestAccessibility() {
        // This call triggers the system prompt the first time.
        // Subsequent calls just return the current status.
        let options = [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true] as CFDictionary
        let granted = AXIsProcessTrustedWithOptions(options)
        isAccessibilityGranted = granted

        if !granted {
            openAccessibilitySettings()
        }
    }

    /// Open System Settings > Privacy & Security > Accessibility.
    func openAccessibilitySettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
        NSWorkspace.shared.open(url)
    }

    /// Open System Settings > Privacy & Security > Automation.
    func openAutomationSettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")!
        NSWorkspace.shared.open(url)
    }

    /// Test Automation permission by sending a harmless AppleScript to Finder.
    func testAutomation() {
        // Sending an Apple Event to a known app triggers the Automation consent dialog.
        let script = NSAppleScript(source: """
            tell application "Finder"
                return name of front window
            end tell
        """)
        var errorInfo: NSDictionary?
        script?.executeAndReturnError(&errorInfo)

        // After the dialog is shown (or permission was already granted/denied),
        // re-check via our heuristic.
        checkAutomation()
    }

    // MARK: - Private Checks

    private func checkAccessibility() {
        isAccessibilityGranted = AXIsProcessTrusted()
    }

    /// Heuristic check for Automation permission.
    ///
    /// macOS does not provide a direct API to query Automation permission status.
    /// We attempt a harmless AppleScript to System Events (which is always running)
    /// and treat success as "granted".
    private func checkAutomation() {
        let script = NSAppleScript(source: """
            tell application "System Events"
                return name of first process whose frontmost is true
            end tell
        """)
        var errorInfo: NSDictionary?
        let result = script?.executeAndReturnError(&errorInfo)
        isAutomationGranted = (result != nil && errorInfo == nil)
    }

    // MARK: - Polling

    /// Poll every 2 seconds to pick up changes made in System Settings.
    private func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refreshAll()
            }
        }
    }
}
