import XCTest
@testable import Gecko

// MARK: - Mock Database

/// A mock DatabaseService that stores sessions in-memory for sync tests.
private final class MockDatabaseService: @unchecked Sendable, DatabaseService {
    var sessions: [FocusSession] = []

    func insert(_ session: FocusSession) throws {
        sessions.append(session)
    }

    func update(_ session: FocusSession) throws {
        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[index] = session
        }
    }

    func save(_ session: FocusSession) throws {
        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[index] = session
        } else {
            sessions.append(session)
        }
    }

    func fetchRecent(limit: Int) throws -> [FocusSession] {
        Array(sessions.sorted { $0.startTime > $1.startTime }.prefix(limit))
    }

    func fetch(id: String) throws -> FocusSession? {
        sessions.first { $0.id == id }
    }

    func fetchUnsynced(since startTime: Double, limit: Int) throws -> [FocusSession] {
        sessions
            .filter { $0.startTime > startTime && $0.duration > 0 }
            .sorted { $0.startTime < $1.startTime }
            .prefix(limit)
            .map { $0 }
    }

    func count() throws -> Int {
        sessions.count
    }

    func deleteAll() throws {
        sessions.removeAll()
    }
}

// MARK: - Mock URL Protocol

/// Intercepts URLSession requests for testing SyncService HTTP calls.
private final class MockURLProtocol: URLProtocol {
    /// Set this to control what the mock returns.
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (Data, HTTPURLResponse))?

    override static func canInit(with request: URLRequest) -> Bool {
        true
    }

    override static func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        do {
            let (data, response) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

// MARK: - Helpers

private func makeSession(id: String, startTime: Double, duration: Double) -> FocusSession {
    FocusSession(
        id: id, appName: "TestApp", bundleId: "com.test.app", windowTitle: "TestWindow",
        url: nil, tabTitle: nil, tabCount: nil, documentPath: nil,
        isFullScreen: false, isMinimized: false,
        startTime: startTime, endTime: startTime + duration, duration: duration
    )
}

private func makeURLSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: config)
}

private func jsonResponse(statusCode: Int, body: [String: Any]) -> (Data, HTTPURLResponse) {
    let data = try! JSONSerialization.data(withJSONObject: body) // swiftlint:disable:this force_try
    let url = URL(string: "https://test.example.com")! // swiftlint:disable:this force_unwrapping
    let response = HTTPURLResponse(url: url, statusCode: statusCode,
                                   httpVersion: nil, headerFields: nil)! // swiftlint:disable:this force_unwrapping
    return (data, response)
}

// MARK: - Tests

@MainActor
final class SyncServiceTests: XCTestCase {

    private var mockDB: MockDatabaseService! // swiftlint:disable:this implicitly_unwrapped_optional
    private var settings: SettingsManager! // swiftlint:disable:this implicitly_unwrapped_optional
    private var suiteName: String = ""

    override func setUp() {
        mockDB = MockDatabaseService()
        suiteName = "com.gecko.test.\(UUID().uuidString)"
        // swiftlint:disable:next force_unwrapping
        settings = SettingsManager(defaults: UserDefaults(suiteName: suiteName)!)
        MockURLProtocol.handler = nil
    }

    override func tearDown() {
        UserDefaults.standard.removePersistentDomain(forName: suiteName)
        MockURLProtocol.handler = nil
    }

    // MARK: - SyncSessionDTO Encoding

    func testSyncSessionDTOEncodesSnakeCase() throws {
        // GIVEN: a focus session
        let session = makeSession(id: "dto-1", startTime: 1000.0, duration: 60.0)

        // WHEN: encoding as DTO
        let dto = SyncSessionDTO(from: session)
        let data = try JSONEncoder().encode(dto)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        // THEN: keys are snake_case
        XCTAssertNotNil(json?["app_name"])
        XCTAssertNotNil(json?["window_title"])
        XCTAssertNotNil(json?["start_time"])
        XCTAssertNotNil(json?["end_time"])
        XCTAssertNotNil(json?["is_full_screen"])
        XCTAssertNotNil(json?["is_minimized"])
        XCTAssertNotNil(json?["bundle_id"])
    }

    func testSyncSessionDTOPreservesValues() {
        let session = FocusSession(
            id: "vals-1", appName: "Chrome", bundleId: "com.google.Chrome",
            windowTitle: "GitHub", url: "https://github.com", tabTitle: "GitHub",
            tabCount: 5, documentPath: nil,
            isFullScreen: true, isMinimized: false,
            startTime: 2000.0, endTime: 2120.0, duration: 120.0
        )

        let dto = SyncSessionDTO(from: session)

        XCTAssertEqual(dto.id, "vals-1")
        XCTAssertEqual(dto.appName, "Chrome")
        XCTAssertEqual(dto.bundleId, "com.google.Chrome")
        XCTAssertEqual(dto.windowTitle, "GitHub")
        XCTAssertEqual(dto.url, "https://github.com")
        XCTAssertEqual(dto.tabTitle, "GitHub")
        XCTAssertEqual(dto.tabCount, 5)
        XCTAssertNil(dto.documentPath)
        XCTAssertTrue(dto.isFullScreen)
        XCTAssertFalse(dto.isMinimized)
        XCTAssertEqual(dto.startTime, 2000.0)
        XCTAssertEqual(dto.endTime, 2120.0)
        XCTAssertEqual(dto.duration, 120.0)
    }

    // MARK: - SyncResponse Decoding

    func testSyncResponseDecodesSnakeCase() throws {
        let json = Data("""
        {"inserted": 42, "duplicates": 3, "sync_id": "abc-123"}
        """.utf8)

        let response = try JSONDecoder().decode(SyncResponse.self, from: json)

        XCTAssertEqual(response.inserted, 42)
        XCTAssertEqual(response.duplicates, 3)
        XCTAssertEqual(response.syncId, "abc-123")
    }

    // MARK: - SyncError Messages

    func testSyncErrorUnauthorizedMessage() {
        let error = SyncError.unauthorized
        XCTAssertTrue(error.userMessage.contains("Invalid API key"))
    }

    func testSyncErrorServerErrorMessage() {
        let error = SyncError.serverError(503)
        XCTAssertTrue(error.userMessage.contains("503"))
        XCTAssertTrue(error.userMessage.contains("retry"))
    }

    // MARK: - Sync Skips When Not Configured

    func testSyncSkipsWhenNotConfigured() async {
        // GIVEN: sync is not configured (no API key)
        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: status is disabled, no HTTP call made
        XCTAssertEqual(syncService.status, .disabled)
    }

    // MARK: - Successful Sync

    func testSuccessfulSyncAdvancesWatermark() async {
        // GIVEN: configured sync and pending sessions
        settings.syncEnabled = true
        settings.apiKey = "gk_test_key"
        settings.syncServerUrl = "https://test.example.com"
        settings.lastSyncedStartTime = 0

        mockDB.sessions = [
            makeSession(id: "s1", startTime: 1000.0, duration: 30.0),
            makeSession(id: "s2", startTime: 1100.0, duration: 45.0)
        ]

        MockURLProtocol.handler = { _ in
            jsonResponse(statusCode: 200, body: [
                "inserted": 2, "duplicates": 0, "sync_id": "sync-1"
            ])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: watermark advanced to last session's start_time
        XCTAssertEqual(settings.lastSyncedStartTime, 1100.0)
        XCTAssertEqual(syncService.status, .idle)
        XCTAssertEqual(syncService.lastSyncCount, 2)
        XCTAssertNotNil(syncService.lastSyncTime)
    }

    // MARK: - No Sessions to Sync

    func testSyncWithNoSessions() async {
        // GIVEN: configured sync but no pending sessions
        settings.syncEnabled = true
        settings.apiKey = "gk_test_key"
        settings.syncServerUrl = "https://test.example.com"

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: no error, count stays 0
        XCTAssertEqual(syncService.status, .idle)
        XCTAssertEqual(syncService.lastSyncCount, 0)
    }

    // MARK: - 401 Unauthorized

    func testUnauthorizedStopsSyncing() async {
        // GIVEN: configured sync with an invalid key
        settings.syncEnabled = true
        settings.apiKey = "gk_bad_key"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [makeSession(id: "s1", startTime: 1000.0, duration: 30.0)]

        MockURLProtocol.handler = { _ in
            jsonResponse(statusCode: 401, body: ["error": "Invalid API key"])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: error status with unauthorized message
        if case .error(let message) = syncService.status {
            XCTAssertTrue(message.contains("Invalid API key"))
        } else {
            XCTFail("Expected error status, got \(syncService.status)")
        }
    }

    // MARK: - 500 Server Error

    func testServerErrorSetsErrorStatus() async {
        // GIVEN: configured sync
        settings.syncEnabled = true
        settings.apiKey = "gk_test"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [makeSession(id: "s1", startTime: 1000.0, duration: 30.0)]

        MockURLProtocol.handler = { _ in
            jsonResponse(statusCode: 500, body: ["error": "Internal server error"])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: error status
        if case .error(let message) = syncService.status {
            XCTAssertTrue(message.contains("500"))
        } else {
            XCTFail("Expected error status, got \(syncService.status)")
        }
        // Watermark should NOT advance
        XCTAssertEqual(settings.lastSyncedStartTime, 0)
    }

    // MARK: - Request Format

    func testRequestIncludesCorrectHeaders() async {
        // GIVEN: configured sync
        settings.syncEnabled = true
        settings.apiKey = "gk_header_test"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [makeSession(id: "s1", startTime: 1000.0, duration: 30.0)]

        var capturedRequest: URLRequest?
        MockURLProtocol.handler = { request in
            capturedRequest = request
            return jsonResponse(statusCode: 200, body: [
                "inserted": 1, "duplicates": 0, "sync_id": "sync-1"
            ])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: request has correct headers and URL
        XCTAssertNotNil(capturedRequest)
        XCTAssertEqual(capturedRequest?.httpMethod, "POST")
        XCTAssertEqual(capturedRequest?.url?.absoluteString, "https://test.example.com/api/sync")
        XCTAssertEqual(capturedRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer gk_header_test")
        XCTAssertEqual(capturedRequest?.value(forHTTPHeaderField: "Content-Type"), "application/json")
    }

    func testRequestBodyContainsSessions() async {
        // GIVEN: configured sync with one session
        settings.syncEnabled = true
        settings.apiKey = "gk_body_test"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [makeSession(id: "body-1", startTime: 2000.0, duration: 60.0)]

        var capturedBody: [String: Any]?
        MockURLProtocol.handler = { request in
            if let data = request.httpBody ?? request.httpBodyStream?.readAll() {
                capturedBody = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            }
            return jsonResponse(statusCode: 200, body: [
                "inserted": 1, "duplicates": 0, "sync_id": "sync-1"
            ])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: body contains sessions array with correct data
        XCTAssertNotNil(capturedBody)
        let sessions = capturedBody?["sessions"] as? [[String: Any]]
        XCTAssertEqual(sessions?.count, 1)
        XCTAssertEqual(sessions?[0]["id"] as? String, "body-1")
        XCTAssertEqual(sessions?[0]["app_name"] as? String, "TestApp")
        XCTAssertEqual(sessions?[0]["start_time"] as? Double, 2000.0)
    }

    // MARK: - 400 Bad Request

    func testBadRequestSetsError() async {
        settings.syncEnabled = true
        settings.apiKey = "gk_test"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [makeSession(id: "s1", startTime: 1000.0, duration: 30.0)]

        MockURLProtocol.handler = { _ in
            jsonResponse(statusCode: 400, body: ["error": "Missing required field: id"])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        await syncService.syncNow()

        if case .error(let message) = syncService.status {
            XCTAssertTrue(message.contains("Missing required field"))
        } else {
            XCTFail("Expected error status")
        }
    }

    // MARK: - Handles Duplicates

    func testHandlesDuplicatesGracefully() async {
        settings.syncEnabled = true
        settings.apiKey = "gk_test"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [
            makeSession(id: "s1", startTime: 1000.0, duration: 30.0),
            makeSession(id: "s2", startTime: 1100.0, duration: 30.0)
        ]

        MockURLProtocol.handler = { _ in
            jsonResponse(statusCode: 200, body: [
                "inserted": 1, "duplicates": 1, "sync_id": "sync-dup"
            ])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        await syncService.syncNow()

        // Both inserted+duplicates count toward total synced
        XCTAssertEqual(syncService.lastSyncCount, 2)
        XCTAssertEqual(syncService.status, .idle)
    }
}

// MARK: - InputStream Helper

private extension InputStream {
    func readAll() -> Data {
        open()
        var data = Data()
        let bufferSize = 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer {
            buffer.deallocate()
            close()
        }
        while hasBytesAvailable {
            let bytesRead = read(buffer, maxLength: bufferSize)
            if bytesRead > 0 {
                data.append(buffer, count: bytesRead)
            }
        }
        return data
    }
}
