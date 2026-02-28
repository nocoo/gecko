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
    private var hasLoggedAccessibilityHint: Bool = false

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
    ///
    /// Important: On macOS, Accessibility permission is tied to the specific binary's
    /// code signature. When running from Xcode, each rebuild may produce a different
    /// signature, causing previously granted permission to stop working.
    /// The fix is to remove the old entry from System Settings and re-authorize.
    func requestAccessibility() {
        // This call triggers the system prompt the first time for this specific binary.
        // It will NOT re-prompt if the user already denied for this exact binary.
        let options = [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true] as CFDictionary
        let granted = AXIsProcessTrustedWithOptions(options)
        isAccessibilityGranted = granted

        if !granted {
            // Also open System Settings so the user can manually toggle
            openAccessibilitySettings()
        }
    }

    /// Reset Accessibility permission for this app via tccutil and re-prompt.
    ///
    /// This is the nuclear option: it removes all Accessibility entries for our bundle ID,
    /// then re-triggers the prompt. Useful when Xcode rebuilds change the binary signature.
    func resetAndRequestAccessibility() {
        let bundleId = Bundle.main.bundleIdentifier ?? "ai.hexly.gecko"
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tccutil")
        process.arguments = ["reset", "Accessibility", bundleId]
        try? process.run()
        process.waitUntilExit()

        // Small delay to let TCC database update, then re-prompt
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.requestAccessibility()
        }
    }

    /// Open System Settings > Privacy & Security > Accessibility.
    func openAccessibilitySettings() {
        // swiftlint:disable:next force_unwrapping
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
        NSWorkspace.shared.open(url)
    }

    /// Open System Settings > Privacy & Security > Automation.
    func openAutomationSettings() {
        // swiftlint:disable:next force_unwrapping
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
        let trusted = AXIsProcessTrusted()
        if !trusted && !hasLoggedAccessibilityHint {
            hasLoggedAccessibilityHint = true
            let bundlePath = Bundle.main.bundlePath
            let pid = ProcessInfo.processInfo.processIdentifier
            print("[PermissionManager] AXIsProcessTrusted() = false")
            print("[PermissionManager] Bundle path: \(bundlePath)")
            print("[PermissionManager] PID: \(pid)")
            print("[PermissionManager] Hint: In System Settings > Accessibility, make sure the entry")
            print("  matches this exact binary. If running from Xcode, you may need to add Xcode itself")
            print("  or the DerivedData binary path to the Accessibility list.")
        }
        isAccessibilityGranted = trusted
    }

    /// Heuristic check for Automation permission.
    ///
    /// macOS does not provide a direct API to query Automation permission status.
    /// We attempt a harmless AppleScript to System Events (which is always running)
    /// and treat success as "granted".
    ///
    /// **Important**: AppleScript execution can block for 50-200ms, so this runs
    /// on a background thread and publishes the result back to main.
    private func checkAutomation() {
        Task.detached(priority: .utility) {
            let script = NSAppleScript(source: """
                tell application "System Events"
                    return name of first process whose frontmost is true
                end tell
            """)
            var errorInfo: NSDictionary?
            let result = script?.executeAndReturnError(&errorInfo)
            let granted = (result != nil && errorInfo == nil)

            await MainActor.run {
                self.isAutomationGranted = granted
            }
        }
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
