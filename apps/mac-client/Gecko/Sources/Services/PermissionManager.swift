import Cocoa
import Combine
import os.log

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
    private let logger = Logger(subsystem: "ai.hexly.gecko", category: "PermissionManager")

    /// Number of poll attempts, used for exponential backoff calculation.
    private var pollAttempts: Int = 0

    // MARK: - Lifecycle

    init() {
        refreshAll()
        if !allPermissionsGranted {
            startPolling()
        }
    }

    deinit {
        pollTimer?.invalidate()
    }

    // MARK: - Public API

    /// Re-check all permission statuses.
    func refreshAll() {
        checkAccessibility()
        checkAutomation()
        updatePolling()
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
        do {
            try process.run()
            process.waitUntilExit()
            logger.info("tccutil reset Accessibility for \(bundleId), exit code: \(process.terminationStatus)")
        } catch {
            logger.error("Failed to run tccutil: \(error)")
        }

        // Small delay to let TCC database update, then re-prompt
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.requestAccessibility()
        }
    }

    /// Open System Settings > Privacy & Security > Accessibility.
    func openAccessibilitySettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else { return }
        NSWorkspace.shared.open(url)
    }

    /// Open System Settings > Privacy & Security > Automation.
    func openAutomationSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") else { return }
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
            logger.warning("""
                AXIsProcessTrusted() = false. \
                Bundle: \(bundlePath), PID: \(pid). \
                Check System Settings > Accessibility matches this binary.
                """)
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
                self.updatePolling()
            }
        }
    }

    // MARK: - Polling

    /// Start or stop the poll timer based on current permission state.
    ///
    /// When all permissions are granted the timer is unnecessary — we stop it to
    /// avoid burning CPU on repeated AppleScript calls.  If a permission is later
    /// revoked (e.g. user toggles in System Settings), callers such as `refreshAll()`
    /// or `requestAccessibility()` will re-evaluate and restart polling as needed.
    private func updatePolling() {
        if allPermissionsGranted {
            stopPolling()
            pollAttempts = 0
        } else {
            // Non-repeating timer: always reschedule for the next tick
            startPolling()
        }
    }

    /// Poll with exponential backoff: 2s (first 30s) → 5s → 10s → 30s.
    ///
    /// Uses a non-repeating timer that reschedules itself, so the interval
    /// can increase as time passes without the user granting permission.
    private func startPolling() {
        let interval: TimeInterval
        switch pollAttempts {
        case 0..<15:   interval = 2.0    // first ~30s: responsive
        case 15..<30:  interval = 5.0    // ~30s–2.5min: moderate
        case 30..<60:  interval = 10.0   // ~2.5–7.5min: relaxed
        default:       interval = 30.0   // 7.5min+: minimal
        }

        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.pollAttempts += 1
                self?.refreshAll()
            }
        }
        // Allow macOS to coalesce timer wake-ups
        pollTimer?.tolerance = interval * 0.25
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }
}
