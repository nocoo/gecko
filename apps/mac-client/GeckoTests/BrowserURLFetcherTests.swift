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

    // MARK: - parseBrowserInfo: Valid output

    func testParseValidFullOutput() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://example.com\tExample Page\t5")
        XCTAssertEqual(info.url, "https://example.com")
        XCTAssertEqual(info.tabTitle, "Example Page")
        XCTAssertEqual(info.tabCount, 5)
    }

    func testParseValidWithSingleTab() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t1")
        XCTAssertEqual(info.tabCount, 1)
    }

    func testParseValidWithLargeTabCount() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t999")
        XCTAssertEqual(info.tabCount, 999)
    }

    // MARK: - parseBrowserInfo: Nil / empty input

    func testParseNilInputReturnsAllNil() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: nil)
        XCTAssertNil(info.url)
        XCTAssertNil(info.tabTitle)
        XCTAssertNil(info.tabCount)
    }

    func testParseEmptyStringReturnsAllNil() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "")
        XCTAssertNil(info.url)
        XCTAssertNil(info.tabTitle)
        XCTAssertNil(info.tabCount)
    }

    // MARK: - parseBrowserInfo: Partial output

    func testParseURLOnly() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://example.com")
        XCTAssertEqual(info.url, "https://example.com")
        XCTAssertNil(info.tabTitle)
        XCTAssertNil(info.tabCount)
    }

    func testParseURLAndTitleOnly() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://example.com\tPage Title")
        XCTAssertEqual(info.url, "https://example.com")
        XCTAssertEqual(info.tabTitle, "Page Title")
        XCTAssertNil(info.tabCount)
    }

    // MARK: - parseBrowserInfo: Empty fields

    func testParseEmptyURLField() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "\tPage Title\t3")
        XCTAssertNil(info.url)
        XCTAssertEqual(info.tabTitle, "Page Title")
        XCTAssertEqual(info.tabCount, 3)
    }

    func testParseEmptyTitleField() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://example.com\t\t3")
        XCTAssertEqual(info.url, "https://example.com")
        XCTAssertNil(info.tabTitle)
        XCTAssertEqual(info.tabCount, 3)
    }

    func testParseAllFieldsEmpty() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "\t\t")
        XCTAssertNil(info.url)
        XCTAssertNil(info.tabTitle)
        XCTAssertNil(info.tabCount)
    }

    // MARK: - parseBrowserInfo: Non-integer tab count

    func testParseNonIntegerTabCountReturnsNil() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\tabc")
        XCTAssertEqual(info.url, "https://a.com")
        XCTAssertEqual(info.tabTitle, "Title")
        XCTAssertNil(info.tabCount)
    }

    func testParseFloatTabCountReturnsNil() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t3.5")
        XCTAssertNil(info.tabCount)
    }

    func testParseEmptyTabCountReturnsNil() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t")
        XCTAssertNil(info.tabCount)
    }

    // MARK: - parseBrowserInfo: Unicode and special characters

    func testParseUnicodeInTitle() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\t日本語タイトル\t2")
        XCTAssertEqual(info.tabTitle, "日本語タイトル")
    }

    func testParseEmojiInTitle() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tHello 🌍 World\t1")
        XCTAssertEqual(info.tabTitle, "Hello 🌍 World")
    }

    func testParseURLWithQueryParams() {
        let url = "https://example.com/search?q=hello+world&lang=en"
        let info = BrowserURLFetcher.parseBrowserInfo(from: "\(url)\tSearch\t1")
        XCTAssertEqual(info.url, url)
    }

    func testParseURLWithFragment() {
        let url = "https://example.com/page#section-2"
        let info = BrowserURLFetcher.parseBrowserInfo(from: "\(url)\tPage\t1")
        XCTAssertEqual(info.url, url)
    }

    // MARK: - parseBrowserInfo: Extra tabs in content

    func testParseExtraTabsInOutput() {
        // If output somehow has 4+ tab-separated parts, extra parts are ignored
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t5\textra")
        XCTAssertEqual(info.url, "https://a.com")
        XCTAssertEqual(info.tabTitle, "Title")
        XCTAssertEqual(info.tabCount, 5)
    }

    func testParseNegativeTabCount() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t-1")
        // Int("-1") succeeds, so tabCount will be -1
        XCTAssertEqual(info.tabCount, -1)
    }

    func testParseZeroTabCount() {
        let info = BrowserURLFetcher.parseBrowserInfo(from: "https://a.com\tTitle\t0")
        XCTAssertEqual(info.tabCount, 0)
    }
}
