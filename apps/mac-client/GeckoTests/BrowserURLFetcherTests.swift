import XCTest
@testable import Gecko

final class BrowserURLFetcherTests: XCTestCase {

    // MARK: - Browser Identification

    func testIdentifyChrome() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Google Chrome")
        XCTAssertNotNil(browser)
        XCTAssertEqual(browser, .chrome)
    }

    func testIdentifySafari() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Safari")
        XCTAssertNotNil(browser)
        XCTAssertEqual(browser, .safari)
    }

    func testIdentifyEdge() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Microsoft Edge")
        XCTAssertNotNil(browser)
        XCTAssertEqual(browser, .edge)
    }

    func testIdentifyBrave() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Brave Browser")
        XCTAssertNotNil(browser)
        XCTAssertEqual(browser, .brave)
    }

    func testIdentifyArc() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Arc")
        XCTAssertNotNil(browser)
        XCTAssertEqual(browser, .arc)
    }

    func testIdentifyVivaldi() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Vivaldi")
        XCTAssertNotNil(browser)
        XCTAssertEqual(browser, .vivaldi)
    }

    func testUnknownAppReturnsNil() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Cursor")
        XCTAssertNil(browser)
    }

    func testUnknownAppReturnsNil2() {
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Finder")
        XCTAssertNil(browser)
    }

    // MARK: - isBrowser

    func testIsBrowserForKnownBrowsers() {
        XCTAssertTrue(BrowserURLFetcher.isBrowser(appName: "Google Chrome"))
        XCTAssertTrue(BrowserURLFetcher.isBrowser(appName: "Safari"))
        XCTAssertTrue(BrowserURLFetcher.isBrowser(appName: "Microsoft Edge"))
        XCTAssertTrue(BrowserURLFetcher.isBrowser(appName: "Arc"))
    }

    func testIsNotBrowserForNonBrowserApps() {
        XCTAssertFalse(BrowserURLFetcher.isBrowser(appName: "Cursor"))
        XCTAssertFalse(BrowserURLFetcher.isBrowser(appName: "Slack"))
        XCTAssertFalse(BrowserURLFetcher.isBrowser(appName: "Terminal"))
        XCTAssertFalse(BrowserURLFetcher.isBrowser(appName: ""))
    }

    // MARK: - Chromium Detection

    func testChromeIsChromiumBased() {
        XCTAssertTrue(BrowserURLFetcher.Browser.chrome.isChromiumBased)
    }

    func testEdgeIsChromiumBased() {
        XCTAssertTrue(BrowserURLFetcher.Browser.edge.isChromiumBased)
    }

    func testBraveIsChromiumBased() {
        XCTAssertTrue(BrowserURLFetcher.Browser.brave.isChromiumBased)
    }

    func testSafariIsNotChromiumBased() {
        XCTAssertFalse(BrowserURLFetcher.Browser.safari.isChromiumBased)
    }

    // MARK: - fetchURL with unknown app

    func testFetchURLForNonBrowserReturnsNil() {
        let url = BrowserURLFetcher.fetchURL(appName: "Finder")
        XCTAssertNil(url)
    }

    // MARK: - All browsers covered

    func testAllBrowsersCovered() {
        // Ensure every Browser case has at least one app name
        for browser in BrowserURLFetcher.Browser.allCases {
            XCTAssertFalse(browser.appNames.isEmpty, "\(browser) has no app names")
            XCTAssertFalse(browser.scriptTarget.isEmpty, "\(browser) has no script target")
        }
    }
}
