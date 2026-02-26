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

    func testFetchURLForNonBrowserReturnsNil() async {
        let url = await BrowserURLFetcher.fetchURL(appName: "Finder")
        XCTAssertNil(url)
    }

    // MARK: - fetchInfo with unknown app

    func testFetchInfoForNonBrowserReturnsNil() async {
        let info = await BrowserURLFetcher.fetchInfo(appName: "Finder")
        XCTAssertNil(info)
    }

    func testFetchInfoForNonBrowserReturnsNilByIdentify() {
        // If we can't identify the browser, fetchInfo(appName:) returns nil
        let browser = BrowserURLFetcher.identifyBrowser(appName: "Terminal")
        XCTAssertNil(browser)
    }

    // MARK: - BrowserInfo struct

    func testBrowserInfoEquatable() {
        let info1 = BrowserInfo(url: "https://example.com", tabTitle: "Example", tabCount: 5)
        let info2 = BrowserInfo(url: "https://example.com", tabTitle: "Example", tabCount: 5)
        XCTAssertEqual(info1, info2)
    }

    func testBrowserInfoEquatableWithNils() {
        let info1 = BrowserInfo(url: nil, tabTitle: nil, tabCount: nil)
        let info2 = BrowserInfo(url: nil, tabTitle: nil, tabCount: nil)
        XCTAssertEqual(info1, info2)
    }

    func testBrowserInfoNotEqualDifferentURL() {
        let info1 = BrowserInfo(url: "https://a.com", tabTitle: "A", tabCount: 1)
        let info2 = BrowserInfo(url: "https://b.com", tabTitle: "A", tabCount: 1)
        XCTAssertNotEqual(info1, info2)
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
