import Cocoa
import os.log

/// Information extracted from a browser via AppleScript.
struct BrowserInfo: Equatable {
    /// The URL of the active tab.
    let url: String?

    /// The title of the active tab (cleaner than window title).
    let tabTitle: String?

    /// The number of open tabs in the front window.
    let tabCount: Int?
}

/// Fetches browser context (URL, tab title, tab count) from known browsers via AppleScript.
///
/// Supported browsers:
/// - Google Chrome (and Chromium-based: Edge, Brave, Arc, Vivaldi)
/// - Safari
enum BrowserURLFetcher {

    private static let logger = Logger(subsystem: "ai.hexly.gecko", category: "BrowserURLFetcher")

    /// Known browser bundle identifiers and their AppleScript strategies.
    enum Browser: CaseIterable {
        case chrome
        case safari
        case edge
        case brave
        case arc
        case vivaldi

        /// The app name as reported by NSRunningApplication.
        var appNames: [String] {
            switch self {
            case .chrome:   return ["Google Chrome"]
            case .safari:   return ["Safari"]
            case .edge:     return ["Microsoft Edge"]
            case .brave:    return ["Brave Browser"]
            case .arc:      return ["Arc"]
            case .vivaldi:  return ["Vivaldi"]
            }
        }

        /// The AppleScript application target name.
        var scriptTarget: String {
            switch self {
            case .chrome:   return "Google Chrome"
            case .safari:   return "Safari"
            case .edge:     return "Microsoft Edge"
            case .brave:    return "Brave Browser"
            case .arc:      return "Arc"
            case .vivaldi:  return "Vivaldi"
            }
        }

        /// Whether this browser uses Chromium-style AppleScript (active tab URL of front window).
        var isChromiumBased: Bool {
            switch self {
            case .safari: return false
            default: return true
            }
        }
    }

    /// Attempt to identify the browser from an app name.
    static func identifyBrowser(appName: String) -> Browser? {
        Browser.allCases.first { browser in
            browser.appNames.contains(appName)
        }
    }

    /// Check if the given app name is a known browser.
    static func isBrowser(appName: String) -> Bool {
        identifyBrowser(appName: appName) != nil
    }

    // MARK: - BrowserInfo Fetching

    /// Fetch URL, tab title, and tab count from the specified browser in a single AppleScript call.
    ///
    /// Runs AppleScript on a background thread to avoid blocking the main thread.
    /// AppleScript execution typically takes 50-200ms.
    /// Returns a BrowserInfo with nil fields if the browser has no open windows or the script fails.
    static func fetchInfo(for browser: Browser) async -> BrowserInfo {
        let scriptSource = buildInfoScript(for: browser)

        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let result = executeScript(scriptSource)
                continuation.resume(returning: result)
            }
        }
    }

    /// Convenience: fetch BrowserInfo by app name. Returns nil if app is not a known browser.
    static func fetchInfo(appName: String) async -> BrowserInfo? {
        guard let browser = identifyBrowser(appName: appName) else {
            return nil
        }
        return await fetchInfo(for: browser)
    }

    // MARK: - Legacy URL-only API (kept for backward compatibility)

    /// Fetch the current URL from the specified browser.
    static func fetchURL(for browser: Browser) async -> String? {
        let info = await fetchInfo(for: browser)
        return info.url
    }

    /// Convenience: fetch URL by app name. Returns nil if app is not a known browser.
    static func fetchURL(appName: String) async -> String? {
        guard let browser = identifyBrowser(appName: appName) else {
            return nil
        }
        return await fetchURL(for: browser)
    }

    /// Synchronous variant for testing only — do NOT call on main thread.
    static func fetchURLSync(for browser: Browser) -> String? {
        let info = fetchInfoSync(for: browser)
        return info.url
    }

    /// Synchronous convenience for testing only.
    static func fetchURLSync(appName: String) -> String? {
        guard let browser = identifyBrowser(appName: appName) else {
            return nil
        }
        return fetchURLSync(for: browser)
    }

    /// Synchronous BrowserInfo fetch for testing only — do NOT call on main thread.
    static func fetchInfoSync(for browser: Browser) -> BrowserInfo {
        let scriptSource = buildInfoScript(for: browser)
        return executeScript(scriptSource)
    }

    // MARK: - Parsing

    /// Parse a tab-delimited AppleScript output string into BrowserInfo.
    ///
    /// Expected format: `"url\ttabTitle\ttabCount"`.
    /// Handles partial output (1 or 2 parts), empty fields, and non-integer tab counts.
    /// Returns all-nil BrowserInfo for nil or empty input.
    static func parseBrowserInfo(from output: String?) -> BrowserInfo {
        guard let output, !output.isEmpty else {
            return BrowserInfo(url: nil, tabTitle: nil, tabCount: nil)
        }

        let parts = output.components(separatedBy: "\t")

        let url = parts.indices.contains(0) && !parts[0].isEmpty ? parts[0] : nil
        let tabTitle = parts.indices.contains(1) && !parts[1].isEmpty ? parts[1] : nil
        let tabCount: Int? = parts.indices.contains(2) ? Int(parts[2]) : nil

        return BrowserInfo(url: url, tabTitle: tabTitle, tabCount: tabCount)
    }

    // MARK: - Private Helpers

    /// Build an AppleScript that returns URL, tab title, and tab count as a tab-delimited string.
    ///
    /// Output format: "url\ttabTitle\ttabCount"
    /// Using tab delimiter because URLs and titles won't contain tabs.
    private static func buildInfoScript(for browser: Browser) -> String {
        if browser.isChromiumBased {
            return """
                tell application "\(browser.scriptTarget)"
                    if (count of windows) > 0 then
                        set frontWin to front window
                        set tabURL to URL of active tab of frontWin
                        set tabName to title of active tab of frontWin
                        set tabNum to count of tabs of frontWin
                        return tabURL & "\t" & tabName & "\t" & (tabNum as text)
                    end if
                end tell
            """
        } else {
            // Safari uses "current tab" instead of "active tab"
            return """
                tell application "\(browser.scriptTarget)"
                    if (count of windows) > 0 then
                        set frontWin to front window
                        set tabURL to URL of current tab of frontWin
                        set tabName to name of current tab of frontWin
                        set tabNum to count of tabs of frontWin
                        return tabURL & "\t" & tabName & "\t" & (tabNum as text)
                    end if
                end tell
            """
        }
    }

    /// Execute an AppleScript and parse the tab-delimited result into BrowserInfo.
    private static func executeScript(_ source: String) -> BrowserInfo {
        let appleScript = NSAppleScript(source: source)
        var errorInfo: NSDictionary?
        let result = appleScript?.executeAndReturnError(&errorInfo)

        if let errorInfo {
            let errorNumber = errorInfo[NSAppleScript.errorNumber] ?? "unknown"
            let errorMessage = errorInfo[NSAppleScript.errorMessage] ?? "no message"
            logger.debug("AppleScript failed: \(String(describing: errorNumber)) — \(String(describing: errorMessage))")
        }

        return parseBrowserInfo(from: result?.stringValue)
    }
}
