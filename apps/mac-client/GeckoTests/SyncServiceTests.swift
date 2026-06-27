// swiftlint:disable file_length
import XCTest
@testable import Gecko

// MARK: - Mock Database

/// A mock DatabaseService that stores sessions in-memory for sync tests.
private final class MockDatabaseService: @unchecked Sendable, DatabaseService {
    var sessions: [FocusSession] = []
    var markSyncedCalls: [(ids: [String], at: Double)] = []
    var clearSyncedStateCalls = 0

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

    func fetchUnsynced(limit: Int) throws -> [FocusSession] {
        sessions
            .filter { $0.syncedAt == nil && $0.duration > 0 }
            .sorted { $0.startTime < $1.startTime }
            .prefix(limit)
            .map { $0 }
    }

    func markSynced(ids: [String], at timestamp: Double) throws {
        markSyncedCalls.append((ids: ids, at: timestamp))
        let set = Set(ids)
        for index in sessions.indices where set.contains(sessions[index].id) {
            sessions[index].syncedAt = timestamp
        }
    }

    var clearSyncedStateError: Error?
    func clearSyncedState() throws {
        clearSyncedStateCalls += 1
        if let clearSyncedStateError {
            throw clearSyncedStateError
        }
        for index in sessions.indices {
            sessions[index].syncedAt = nil
        }
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
        startTime: startTime, endTime: startTime + duration, duration: duration,
        syncedAt: nil
    )
}

private func makeURLSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: config)
}

private func jsonResponse(statusCode: Int, body: [String: Any]) -> (Data, HTTPURLResponse) {
    let data = try! JSONSerialization.data(withJSONObject: body) // swiftlint:disable:this force_try
    let url = URL(string: "https://test.example.com")!
    let response = HTTPURLResponse(url: url, statusCode: statusCode,
                                   httpVersion: nil, headerFields: nil)! // swiftlint:disable:this force_unwrapping
    return (data, response)
}

// MARK: - Tests

@MainActor
// swiftlint:disable:next type_body_length
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
        XCTAssertNil(json?["end_time"]) // end_time is no longer sent
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
            startTime: 2000.0, endTime: 2120.0, duration: 120.0,
            syncedAt: nil
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
        // endTime is no longer part of DTO — server computes it
        XCTAssertEqual(dto.duration, 120.0)
    }

    // MARK: - SyncResponse Decoding

    func testSyncResponseDecodesSnakeCase() throws {
        let json = Data("""
        {"accepted": 42, "sync_id": "abc-123"}
        """.utf8)

        let response = try JSONDecoder().decode(SyncResponse.self, from: json)

        XCTAssertEqual(response.accepted, 42)
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

    // MARK: - Reset Sync State

    func testResetSyncStateClearsSyncedAtAndWatermark() {
        settings.lastSyncedStartTime = 12345
        mockDB.sessions = [
            makeSession(id: "a", startTime: 100, duration: 1),
            makeSession(id: "b", startTime: 200, duration: 1)
        ]
        mockDB.sessions[0].syncedAt = 9999
        mockDB.sessions[1].syncedAt = 9999

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)
        let ok = syncService.resetSyncState()

        XCTAssertTrue(ok)
        XCTAssertEqual(mockDB.clearSyncedStateCalls, 1)
        XCTAssertNil(mockDB.sessions[0].syncedAt)
        XCTAssertNil(mockDB.sessions[1].syncedAt)
        XCTAssertEqual(settings.lastSyncedStartTime, 0)
    }

    /// Regression: a Reset that lands mid-cycle would clear synced_at on every
    /// row, then drainBatches' next markSynced would set the in-flight batch
    /// back to synced — silently skipping those rows in the re-upload. Refuse
    /// the reset while .syncing instead.
    /// Regression: if clearSyncedState throws, the DB still holds synced_at
    /// on every row. Returning true and zeroing the watermark anyway would
    /// leave callers (the ViewModel) clearing apiKey/url/syncEnabled and
    /// drifting into a settings-vs-DB desync. Refuse and leave the watermark
    /// alone instead.
    func testResetSyncStateRefusedWhenClearSyncedStateThrows() {
        struct ClearError: Error {}
        settings.lastSyncedStartTime = 9999
        mockDB.sessions = [makeSession(id: "stuck", startTime: 1, duration: 1)]
        mockDB.sessions[0].syncedAt = 5000
        mockDB.clearSyncedStateError = ClearError()

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)
        let ok = syncService.resetSyncState()

        XCTAssertFalse(ok)
        XCTAssertEqual(mockDB.clearSyncedStateCalls, 1)
        XCTAssertEqual(mockDB.sessions[0].syncedAt, 5000)
        XCTAssertEqual(settings.lastSyncedStartTime, 9999)
    }

    func testResetSyncStateRefusedDuringActiveCycle() async {
        settings.syncEnabled = true
        settings.apiKey = "gk_test"
        settings.syncServerUrl = "https://test.example.com"
        mockDB.sessions = [makeSession(id: "s", startTime: 1, duration: 1)]

        // Block the upload so we can observe transient .syncing state.
        let blocker = AsyncBlocker()
        MockURLProtocol.handler = { _ in
            blocker.wait()
            return jsonResponse(statusCode: 202, body: ["accepted": 1, "sync_id": "x"])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // Start the sync but don't await it.
        let syncTask = Task { await syncService.syncNow() }

        // Spin until the status flips to .syncing.
        for _ in 0..<100 {
            if syncService.status == .syncing { break }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTAssertEqual(syncService.status, .syncing)

        // The reset must refuse and leave nothing changed.
        let ok = syncService.resetSyncState()
        XCTAssertFalse(ok)
        XCTAssertEqual(mockDB.clearSyncedStateCalls, 0)

        // Let the upload finish and the cycle complete.
        blocker.release()
        await syncTask.value
    }

    // MARK: - Resumable Sync

    /// Regression: when batch N fails, only batches 1..N-1 should be marked
    /// synced. The failed batch must remain pending so the next cycle retries
    /// exactly those rows — no data loss, no full restart.
    func testFailedBatchLeavesItsRowsUnsynced() async {
        settings.syncEnabled = true
        settings.apiKey = "gk_test"
        settings.syncServerUrl = "https://test.example.com"

        // Two full batches' worth of sessions (using a tiny batch size means
        // we'd need too many rows; rely on the production batchSize=250 by
        // crafting 251 sessions so drainBatches loops at least twice).
        var rows: [FocusSession] = []
        for i in 0..<251 {
            rows.append(makeSession(id: "r\(i)", startTime: 1000.0 + Double(i), duration: 1.0))
        }
        mockDB.sessions = rows

        var callIndex = 0
        MockURLProtocol.handler = { _ in
            callIndex += 1
            if callIndex == 1 {
                return jsonResponse(statusCode: 202, body: ["accepted": 250, "sync_id": "ok"])
            }
            return jsonResponse(statusCode: 500, body: ["error": "boom"])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        await syncService.syncNow()

        // Batch 1 succeeded → 250 ids marked. Batch 2 failed → r250 still unsynced.
        XCTAssertEqual(mockDB.markSyncedCalls.count, 1)
        XCTAssertEqual(mockDB.markSyncedCalls[0].ids.count, 250)
        XCTAssertNil(mockDB.sessions.first { $0.id == "r250" }?.syncedAt)
        XCTAssertNotNil(mockDB.sessions.first { $0.id == "r0" }?.syncedAt)
    }

    // MARK: - Successful Sync

    func testSuccessfulSyncMarksSessionsSynced() async {
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
            jsonResponse(statusCode: 202, body: [
                "accepted": 2, "sync_id": "sync-1"
            ])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        // WHEN: syncing
        await syncService.syncNow()

        // THEN: all uploaded ids marked synced; legacy watermark also advances for diagnostics
        XCTAssertEqual(mockDB.markSyncedCalls.count, 1)
        XCTAssertEqual(Set(mockDB.markSyncedCalls[0].ids), ["s1", "s2"])
        XCTAssertNotNil(mockDB.sessions.first { $0.id == "s1" }?.syncedAt)
        XCTAssertNotNil(mockDB.sessions.first { $0.id == "s2" }?.syncedAt)
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
        // No rows should be marked synced — the same batch must retry next cycle
        XCTAssertTrue(mockDB.markSyncedCalls.isEmpty)
        XCTAssertNil(mockDB.sessions.first { $0.id == "s1" }?.syncedAt)
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
            return jsonResponse(statusCode: 202, body: [
                "accepted": 1, "sync_id": "sync-1"
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
            return jsonResponse(statusCode: 202, body: [
                "accepted": 1, "sync_id": "sync-1"
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

    // MARK: - Accepted Count

    func testAcceptedCountMatchesSessions() async {
        settings.syncEnabled = true
        settings.apiKey = "gk_test"
        settings.syncServerUrl = "https://test.example.com"

        mockDB.sessions = [
            makeSession(id: "s1", startTime: 1000.0, duration: 30.0),
            makeSession(id: "s2", startTime: 1100.0, duration: 30.0)
        ]

        MockURLProtocol.handler = { _ in
            jsonResponse(statusCode: 202, body: [
                "accepted": 2, "sync_id": "sync-acc"
            ])
        }

        let syncService = SyncService(db: mockDB, settings: settings,
                                      session: makeURLSession(), syncInterval: 999)

        await syncService.syncNow()

        // Server accepted all sessions
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

// MARK: - AsyncBlocker

/// A tiny semaphore wrapper for blocking the sync MockURLProtocol mid-flight
/// until the test calls `release()`. Used to observe transient .syncing state.
private final class AsyncBlocker: @unchecked Sendable {
    private let semaphore = DispatchSemaphore(value: 0)
    func wait() { semaphore.wait() }
    func release() { semaphore.signal() }
}
