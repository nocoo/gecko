import Foundation
import Combine
import os
import Security

// MARK: - TLS Session Delegate

/// Handles TLS server trust challenges for development builds using local CA certificates
/// (e.g. mkcert). Evaluates the server certificate against the full system trust store —
/// including locally-installed development CAs. In RELEASE builds this class is never
/// instantiated; standard ATS validation applies instead.
final class SyncSessionDelegate: NSObject, URLSessionDelegate {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Evaluate using the system trust store (includes mkcert root CA)
        var error: CFError?
        let trusted = SecTrustEvaluateWithError(serverTrust, &error)
        if trusted {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}

/// Periodically syncs finalized focus sessions to the cloud via POST /api/sync.
///
/// **Architecture:**
/// 1. Timer-based: fires every 5 minutes (configurable for testing).
/// 2. Watermark strategy: tracks `lastSyncedStartTime` — only fetches sessions
///    with `start_time` after the watermark and `duration > 0`.
/// 3. Batch upload: sends up to 1000 sessions per request, loops until drained.
/// 4. Error handling: 401 stops syncing (invalid key), 5xx retries next tick.
@MainActor
final class SyncService: ObservableObject {

    // MARK: - Published State

    /// Current sync status for UI display.
    @Published private(set) var status: SyncStatus = .idle

    /// Last error message, if any.
    @Published private(set) var lastError: String?

    /// Timestamp of the last successful sync.
    @Published private(set) var lastSyncTime: Date?

    /// Number of sessions synced in the last batch.
    @Published private(set) var lastSyncCount: Int = 0

    // MARK: - Status Enum

    enum SyncStatus: Equatable {
        case idle
        case syncing
        case error(String)
        case disabled
    }

    // MARK: - Dependencies

    private let db: any DatabaseService
    private let settings: SettingsManager
    private let session: URLSession
    private let syncInterval: TimeInterval

    /// Retained reference so the URLSession delegate is not deallocated.
    private let sessionDelegate: SyncSessionDelegate? // swiftlint:disable:this unused_declaration

    // MARK: - Private State

    private var timer: Timer?
    private var settingsCancellable: AnyCancellable?
    private let logger = Logger(subsystem: "ai.hexly.gecko", category: "SyncService")

    // MARK: - Init

    /// Creates a new SyncService.
    ///
    /// - Parameters:
    ///   - db: Database to fetch unsynced sessions from.
    ///   - settings: User settings (API key, server URL, watermark).
    ///   - session: URLSession override. Pass `nil` (default) to auto-create one
    ///     with a TLS delegate for DEBUG builds. Pass a custom session for tests.
    ///   - syncInterval: Seconds between sync ticks (default 300).
    init(
        db: any DatabaseService,
        settings: SettingsManager,
        session: URLSession? = nil,
        syncInterval: TimeInterval = 300 // 5 minutes
    ) {
        self.db = db
        self.settings = settings
        self.syncInterval = syncInterval

        // In DEBUG builds, create a URLSession with a delegate that trusts local CAs
        // (e.g. mkcert). In RELEASE builds or when a session is injected (tests), skip.
        if let session {
            self.session = session
            self.sessionDelegate = nil
        } else {
            #if DEBUG
            let delegate = SyncSessionDelegate()
            self.sessionDelegate = delegate
            self.session = URLSession(
                configuration: .default,
                delegate: delegate,
                delegateQueue: nil
            )
            #else
            self.session = .shared
            self.sessionDelegate = nil
            #endif
        }

        // Observe settings changes to start/stop sync
        settingsCancellable = settings.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.evaluateSyncState()
            }
        }

        evaluateSyncState()
    }

    deinit {
        timer?.invalidate()
    }

    // MARK: - Timer Management

    /// Start or stop the sync timer based on settings.
    func evaluateSyncState() {
        if settings.isSyncConfigured {
            startTimer()
        } else {
            stopTimer()
            if !settings.syncEnabled {
                status = .disabled
                logger.debug("Sync disabled by user")
            } else {
                status = .idle
                logger.debug("Sync idle — missing API key or server URL")
            }
        }
    }

    private func startTimer() {
        guard timer == nil else { return }
        logger.info("Sync timer started (interval: \(self.syncInterval)s)")

        // Fire immediately, then on interval
        Task { await syncNow() }

        timer = Timer.scheduledTimer(withTimeInterval: syncInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.syncNow()
            }
        }
    }

    private func stopTimer() {
        if timer != nil {
            logger.info("Sync timer stopped")
        }
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Sync Execution

    /// Trigger a sync cycle immediately. Loops until all pending sessions are uploaded.
    func syncNow() async {
        guard settings.isSyncConfigured else {
            logger.debug("Sync skipped — not configured")
            return
        }

        guard status != .syncing else {
            logger.debug("Sync skipped — already in progress")
            return
        }

        status = .syncing
        lastError = nil

        let cycleStart = Date()
        logger.info("""
            Sync cycle started — server: \(self.settings.syncServerUrl), \
            watermark: \(self.settings.lastSyncedStartTime, format: .fixed(precision: 3))
            """)

        do {
            let (totalSynced, batchCount) = try await drainBatches()
            let totalElapsed = Date().timeIntervalSince(cycleStart)
            lastSyncTime = Date()
            lastSyncCount = totalSynced
            status = .idle
            if totalSynced > 0 {
                logger.info("""
                    Sync cycle complete: \(totalSynced) sessions in \(batchCount) batch(es), \
                    took \(totalElapsed, format: .fixed(precision: 2))s
                    """)
            } else {
                logger.debug("Sync cycle complete: nothing to sync")
            }
        } catch let error as SyncError {
            handleSyncError(error)
        } catch {
            lastError = error.localizedDescription
            status = .error(error.localizedDescription)
            logger.error("Sync failed: \(error.localizedDescription)")
        }
    }

    /// Upload sessions in batches of 1000 until all pending sessions are drained.
    /// Returns (totalSynced, batchCount).
    private func drainBatches() async throws -> (Int, Int) {
        var totalSynced = 0
        var batchNumber = 0

        while true {
            batchNumber += 1
            let sessions = try db.fetchUnsynced(
                since: settings.lastSyncedStartTime,
                limit: 1000
            )

            if sessions.isEmpty {
                if batchNumber == 1 {
                    logger.debug("No sessions to sync (watermark up-to-date)")
                }
                break
            }

            let firstTime = sessions.first?.startTime ?? 0
            let lastTime = sessions.last?.startTime ?? 0
            logger.info("""
                Batch \(batchNumber): \(sessions.count) sessions \
                [startTime \(firstTime, format: .fixed(precision: 3))…\
                \(lastTime, format: .fixed(precision: 3))]
                """)

            let batchStart = Date()
            let result = try await uploadBatch(sessions)
            let elapsed = Date().timeIntervalSince(batchStart)

            logger.info("""
                Batch \(batchNumber) done in \(elapsed, format: .fixed(precision: 2))s — \
                accepted: \(result.accepted), syncId: \(result.syncId)
                """)

            totalSynced += result.accepted

            // Advance watermark to the last session's start_time
            if let lastSession = sessions.last {
                let oldWatermark = settings.lastSyncedStartTime
                settings.lastSyncedStartTime = lastSession.startTime
                logger.debug("""
                    Watermark advanced: \(oldWatermark, format: .fixed(precision: 3)) → \
                    \(lastSession.startTime, format: .fixed(precision: 3))
                    """)
            }

            // If we got fewer than 1000, we're done
            if sessions.count < 1000 {
                break
            }
        }

        return (totalSynced, batchNumber)
    }

    // MARK: - HTTP Upload

    /// Upload a batch of sessions to the sync endpoint.
    private func uploadBatch(_ sessions: [FocusSession]) async throws -> SyncResponse {
        let url = URL(string: "\(settings.syncServerUrl)/api/sync")!  // swiftlint:disable:this force_unwrapping
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")

        let payload = SyncPayload(sessions: sessions.map(SyncSessionDTO.init))
        let body = try JSONEncoder().encode(payload)
        request.httpBody = body

        let bodyKB = Double(body.count) / 1024.0
        logger.debug("POST \(url.absoluteString) (\(bodyKB, format: .fixed(precision: 1)) KB)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }

        let statusCode = httpResponse.statusCode
        if statusCode != 202 {
            logger.warning("Server returned HTTP \(statusCode), body: \(data.count) bytes")
        }

        switch statusCode {
        case 200, 202:
            return try JSONDecoder().decode(SyncResponse.self, from: data)
        case 401:
            throw SyncError.unauthorized
        case 400:
            let message = parseErrorMessage(from: data) ?? "Bad request"
            throw SyncError.badRequest(message)
        case 413:
            throw SyncError.batchTooLarge
        default:
            throw SyncError.serverError(statusCode)
        }
    }

    private func parseErrorMessage(from data: Data) -> String? {
        if let json = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
            return json.error
        }
        return nil
    }

    // MARK: - Error Handling

    private func handleSyncError(_ error: SyncError) {
        let message = error.userMessage
        lastError = message
        status = .error(message)
        logger.error("Sync error: \(message)")

        // 401 = invalid key, stop syncing to avoid hammering
        if case .unauthorized = error {
            logger.warning("API key rejected — stopping sync timer")
            stopTimer()
        }
    }
}

// MARK: - Sync Error

enum SyncError: Error, Equatable {
    case unauthorized
    case badRequest(String)
    case batchTooLarge
    case serverError(Int)
    case invalidResponse

    var userMessage: String {
        switch self {
        case .unauthorized:
            return "Invalid API key. Check your key in Settings."
        case .badRequest(let detail):
            return "Bad request: \(detail)"
        case .batchTooLarge:
            return "Batch too large. This should not happen — please report a bug."
        case .serverError(let code):
            return "Server error (\(code)). Will retry."
        case .invalidResponse:
            return "Invalid server response."
        }
    }
}

// MARK: - DTOs

/// The JSON payload sent to POST /api/sync.
private struct SyncPayload: Encodable {
    let sessions: [SyncSessionDTO]
}

/// Maps FocusSession to the snake_case JSON the server expects.
/// Note: end_time is intentionally excluded — the server computes it
/// from start_time + duration. This reduces bind parameters for D1.
struct SyncSessionDTO: Codable, Equatable {
    let id: String
    let appName: String
    let windowTitle: String
    let url: String?
    let startTime: Double
    let duration: Double
    let bundleId: String?
    let tabTitle: String?
    let tabCount: Int?
    let documentPath: String?
    let isFullScreen: Bool
    let isMinimized: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case appName = "app_name"
        case windowTitle = "window_title"
        case url
        case startTime = "start_time"
        case duration
        case bundleId = "bundle_id"
        case tabTitle = "tab_title"
        case tabCount = "tab_count"
        case documentPath = "document_path"
        case isFullScreen = "is_full_screen"
        case isMinimized = "is_minimized"
    }

    init(from session: FocusSession) {
        self.id = session.id
        self.appName = session.appName
        self.windowTitle = session.windowTitle
        self.url = session.url
        self.startTime = session.startTime
        self.duration = session.duration
        self.bundleId = session.bundleId
        self.tabTitle = session.tabTitle
        self.tabCount = session.tabCount
        self.documentPath = session.documentPath
        self.isFullScreen = session.isFullScreen
        self.isMinimized = session.isMinimized
    }
}

/// The JSON response from POST /api/sync (202 Accepted).
struct SyncResponse: Codable, Equatable {
    let accepted: Int
    let syncId: String

    enum CodingKeys: String, CodingKey {
        case accepted
        case syncId = "sync_id"
    }
}

/// Error response from the server.
private struct ErrorResponse: Codable {
    let error: String
}
