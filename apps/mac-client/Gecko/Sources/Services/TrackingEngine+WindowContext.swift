import Cocoa

/// Extension that handles Accessibility API window context reading.
///
/// Reads all window attributes (title, document path, full-screen, minimized)
/// in a single AX lookup instead of 4 separate `focusedWindow(for:)` calls.
/// This reduces AX IPC round-trips from ~5 to ~2 per tick.
extension TrackingEngine {

    /// Read all window attributes in a single AX lookup.
    ///
    /// Instead of calling `focusedWindow(for:)` 4 separate times (title, document,
    /// fullscreen, minimized), we fetch the focused window element once and read
    /// all attributes from it. This reduces AX IPC round-trips from ~5 to ~2 per tick.
    func readWindowContext(for app: NSRunningApplication) -> WindowContext {
        let pid = app.processIdentifier
        let appElement = AXUIElementCreateApplication(pid)

        // One IPC call to get the focused window
        var windowValue: AnyObject?
        let result = AXUIElementCopyAttributeValue(
            appElement, kAXFocusedWindowAttribute as CFString, &windowValue
        )
        guard result == .success, let windowRef = windowValue else {
            return WindowContext(title: app.localizedName ?? "Unknown")
        }

        // swiftlint:disable:next force_cast
        let window = windowRef as! AXUIElement

        // Read all attributes from the cached window element
        let title: String = {
            guard let val = readAXAttribute(window, kAXTitleAttribute as CFString) as? String,
                  !val.isEmpty else {
                return app.localizedName ?? "Unknown"
            }
            return val
        }()

        let documentPath: String? = {
            guard let urlString = readAXAttribute(window, kAXDocumentAttribute as CFString) as? String,
                  !urlString.isEmpty else {
                return nil
            }
            if let url = URL(string: urlString), url.isFileURL {
                return url.path
            }
            return urlString
        }()

        let isFullScreen = readAXAttribute(window, "AXFullScreen" as CFString) as? Bool ?? false
        let isMinimized = readAXAttribute(window, kAXMinimizedAttribute as CFString) as? Bool ?? false

        return WindowContext(
            title: title,
            documentPath: documentPath,
            isFullScreen: isFullScreen,
            isMinimized: isMinimized
        )
    }

    /// Read a single attribute from an AX element.
    func readAXAttribute(_ element: AXUIElement, _ attribute: CFString) -> AnyObject? {
        var value: AnyObject?
        AXUIElementCopyAttributeValue(element, attribute, &value)
        return value
    }
}
