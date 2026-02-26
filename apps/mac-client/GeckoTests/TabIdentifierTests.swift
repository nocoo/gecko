import XCTest
@testable import Gecko

final class TabIdentifierTests: XCTestCase {

    // MARK: - All Cases

    func testAllCasesCount() {
        XCTAssertEqual(TabIdentifier.allCases.count, 4)
    }

    func testCaseOrder() {
        let cases = TabIdentifier.allCases
        XCTAssertEqual(cases[0], .tracking)
        XCTAssertEqual(cases[1], .sessions)
        XCTAssertEqual(cases[2], .settings)
        XCTAssertEqual(cases[3], .about)
    }

    // MARK: - Raw Values

    func testRawValues() {
        XCTAssertEqual(TabIdentifier.tracking.rawValue, 0)
        XCTAssertEqual(TabIdentifier.sessions.rawValue, 1)
        XCTAssertEqual(TabIdentifier.settings.rawValue, 2)
        XCTAssertEqual(TabIdentifier.about.rawValue, 3)
    }

    // MARK: - Labels

    func testLabelsAreNonEmpty() {
        for tab in TabIdentifier.allCases {
            XCTAssertFalse(tab.label.isEmpty, "\(tab) should have a non-empty label")
        }
    }

    func testExpectedLabels() {
        XCTAssertEqual(TabIdentifier.tracking.label, "Tracking")
        XCTAssertEqual(TabIdentifier.sessions.label, "Sessions")
        XCTAssertEqual(TabIdentifier.settings.label, "Settings")
        XCTAssertEqual(TabIdentifier.about.label, "About")
    }

    // MARK: - Icons

    func testIconsAreNonEmpty() {
        for tab in TabIdentifier.allCases {
            XCTAssertFalse(tab.icon.isEmpty, "\(tab) should have a non-empty icon name")
        }
    }

    // MARK: - Identifiable

    func testIdentifiableId() {
        for tab in TabIdentifier.allCases {
            XCTAssertEqual(tab.id, tab.rawValue)
        }
    }

    func testUniqueIds() {
        let ids = TabIdentifier.allCases.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "All tab IDs should be unique")
    }

    // MARK: - TabSelection

    @MainActor
    func testTabSelectionDefaultsToTracking() {
        let selection = TabSelection()
        XCTAssertEqual(selection.selectedTab, .tracking)
    }

    @MainActor
    func testTabSelectionCanBeChanged() {
        let selection = TabSelection()
        selection.selectedTab = .about
        XCTAssertEqual(selection.selectedTab, .about)
    }
}
