import XCTest
@testable import Gecko

// MARK: - SyncSessionDelegate Tests

final class SyncSessionDelegateTests: XCTestCase {

    private var delegate: SyncSessionDelegate! // swiftlint:disable:this implicitly_unwrapped_optional

    override func setUp() {
        super.setUp()
        delegate = SyncSessionDelegate()
    }

    override func tearDown() {
        delegate = nil
        super.tearDown()
    }

    // GIVEN a challenge that is NOT server trust (e.g. HTTP Basic)
    // WHEN the delegate handles it
    // THEN it should fall through to default handling
    func testNonServerTrustChallengeUsesDefaultHandling() {
        let expectation = expectation(description: "completionHandler called")
        let protection = URLProtectionSpace(
            host: "example.com",
            port: 443,
            protocol: NSURLProtectionSpaceHTTPS,
            realm: nil,
            authenticationMethod: NSURLAuthenticationMethodHTTPBasic
        )
        let challenge = URLAuthenticationChallenge(
            protectionSpace: protection,
            proposedCredential: nil,
            previousFailureCount: 0,
            failureResponse: nil,
            error: nil,
            sender: MockChallengeSender()
        )

        delegate.urlSession(URLSession.shared, didReceive: challenge) { disposition, credential in
            XCTAssertEqual(disposition, .performDefaultHandling)
            XCTAssertNil(credential)
            expectation.fulfill()
        }

        waitForExpectations(timeout: 1)
    }

    // GIVEN a server trust challenge with a valid system-trusted certificate
    // WHEN the delegate handles it
    // THEN it should accept with .useCredential (if system CA verifies it)
    //      OR fall through to .performDefaultHandling (if no valid trust)
    // NOTE: This test verifies the delegate calls the completionHandler without crashing.
    func testServerTrustChallengeCallsCompletionHandler() {
        let expectation = expectation(description: "completionHandler called")
        let protection = URLProtectionSpace(
            host: "example.com",
            port: 443,
            protocol: NSURLProtectionSpaceHTTPS,
            realm: nil,
            authenticationMethod: NSURLAuthenticationMethodServerTrust
        )
        let challenge = URLAuthenticationChallenge(
            protectionSpace: protection,
            proposedCredential: nil,
            previousFailureCount: 0,
            failureResponse: nil,
            error: nil,
            sender: MockChallengeSender()
        )

        delegate.urlSession(URLSession.shared, didReceive: challenge) { disposition, _ in
            // Without a real SecTrust, serverTrust is nil on URLProtectionSpace
            // constructed without one → guard fails → performDefaultHandling
            XCTAssertEqual(disposition, .performDefaultHandling)
            expectation.fulfill()
        }

        waitForExpectations(timeout: 1)
    }
}

// MARK: - Mock Challenge Sender

/// Minimal mock that satisfies URLAuthenticationChallengeSender protocol.
private final class MockChallengeSender: NSObject, URLAuthenticationChallengeSender {
    func use(_ credential: URLCredential, for challenge: URLAuthenticationChallenge) {}
    func continueWithoutCredential(for challenge: URLAuthenticationChallenge) {}
    func cancel(_ challenge: URLAuthenticationChallenge) {}
}
