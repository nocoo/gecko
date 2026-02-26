import Cocoa

/// Fetches the current URL from known browsers via AppleScript.
///
/// Supported browsers:
/// - Google Chrome (and Chromium-based: Edge, Brave, Arc, Vivaldi)
/// - Safari
enum BrowserURLFetcher {

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

    /// Fetch the current URL from the specified browser.
    ///
    /// Runs on the calling thread. AppleScript execution may block briefly (~50ms).
    /// Returns nil if the browser has no open windows or the script fails.
    static func fetchURL(for browser: Browser) -> String? {
        let script: String
        if browser.isChromiumBased {
            script = """
                tell application "\(browser.scriptTarget)"
                    if (count of windows) > 0 then
                        return URL of active tab of front window
                    end if
                end tell
            """
        } else {
            // Safari
            script = """
                tell application "\(browser.scriptTarget)"
                    if (count of windows) > 0 then
                        return URL of current tab of front window
                    end if
                end tell
            """
        }

        let appleScript = NSAppleScript(source: script)
        var errorInfo: NSDictionary?
        let result = appleScript?.executeAndReturnError(&errorInfo)

        guard let urlString = result?.stringValue, !urlString.isEmpty else {
            return nil
        }

        return urlString
    }

    /// Convenience: fetch URL by app name. Returns nil if app is not a known browser.
    static func fetchURL(appName: String) -> String? {
        guard let browser = identifyBrowser(appName: appName) else {
            return nil
        }
        return fetchURL(for: browser)
    }
}
