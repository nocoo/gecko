// swiftlint:disable file_length
import Foundation
import Combine
import Network
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
/// Per-row state: each `focus_sessions` row carries a `synced_at` column
/// (NULL until the server 202s a batch containing its id). Successful batches
/// mark only their own ids — a timeout or 5xx leaves the rows in the queue
/// for the next 5-minute tick. 401 stops syncing (invalid key).
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

    // MARK: - Constants

    /// Sessions per upload batch. Smaller batches keep the request body small
    /// (~80 KB) so a slow D1 round trip on the server (api_key validation)
    /// can't exhaust URLSession's request timeout before the 202 lands.
    private static let batchSize = 250

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

    // MARK: - Network Awareness

    /// Monitors network reachability to skip futile sync attempts when offline.
    private let networkMonitor = NWPathMonitor()
    private var isNetworkAvailable = true

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
            // Bump request/resource timeouts well above URLSession's 60 s default
            // so one slow D1 round trip (API-key validation) doesn't kill a cycle.
            //
            // `.ephemeral` so no Alt-Svc records persist between launches —
            // critical because cached HTTP/3 (QUIC) records can pin future
            // requests to UDP/443, which is silently dropped by some
            // split-tunnel VPNs and restrictive proxies. Combined with the
            // per-request `assumesHTTP3Capable = false` in uploadBatch, this
            // keeps sync traffic on HTTP/2 over TCP where shell curl works.
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 120
            config.timeoutIntervalForResource = 180

            #if DEBUG
            let delegate = SyncSessionDelegate()
            self.sessionDelegate = delegate
            self.session = URLSession(
                configuration: config,
                delegate: delegate,
                delegateQueue: nil
            )
            #else
            self.sessionDelegate = nil
            self.session = URLSession(configuration: config)
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
        networkMonitor.cancel()
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

        startNetworkMonitor()

        // Fire immediately, then on interval
        Task { await syncNow() }

        timer = Timer.scheduledTimer(withTimeInterval: syncInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.syncNow()
            }
        }
        // Allow macOS to coalesce timer wake-ups (±60s on a 300s interval is fine)
        timer?.tolerance = 60.0
    }

    private func stopTimer() {
        if timer != nil {
            logger.info("Sync timer stopped")
        }
        timer?.invalidate()
        timer = nil
        stopNetworkMonitor()
    }

    // MARK: - Network Monitor

    /// Start observing network reachability.
    private func startNetworkMonitor() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.isNetworkAvailable = (path.status == .satisfied)
            }
        }
        networkMonitor.start(queue: DispatchQueue.global(qos: .utility))
    }

    /// Stop the network monitor.
    private func stopNetworkMonitor() {
        networkMonitor.cancel()
    }

    // MARK: - Reset

    /// Clear all per-row sync state and the legacy watermark — Settings
    /// "Reset sync state". Next cycle re-uploads everything; server's
    /// INSERT OR IGNORE keeps it safe.
    ///
    /// Returns false when the reset cannot complete:
    /// - `.syncing`: drainBatches has already fetched its batch in memory
    ///   and would mark those ids back to synced after the reset, silently
    ///   skipping them in the re-upload.
    /// - DB write failure: synced_at would stay set on every row, but the
    ///   legacy watermark would have been cleared anyway — settings/DB
    ///   would desync. Bail before touching the watermark.
    /// Callers (SettingsViewModel.resetSyncSettings) rely on this to gate
    /// any user-visible side effects.
    @discardableResult
    func resetSyncState() -> Bool {
        guard status != .syncing else {
            logger.warning("resetSyncState refused: sync cycle in progress")
            return false
        }
        do {
            try db.clearSyncedState()
        } catch {
            logger.error("resetSyncState refused: clearSyncedState failed: \(error.localizedDescription)")
            return false
        }
        settings.lastSyncedStartTime = 0
        return true
    }

    // MARK: - Sync Execution

    /// Trigger a sync cycle immediately. Loops until all pending sessions are uploaded.
    func syncNow() async {
        guard settings.isSyncConfigured else {
            logger.info("""
                syncNow skipped: not configured \
                (enabled=\(self.settings.syncEnabled, privacy: .public), \
                apiKey.empty=\(self.settings.apiKey.isEmpty, privacy: .public))
                """)
            return
        }

        guard isNetworkAvailable else {
            logger.info("syncNow skipped: network unavailable")
            return
        }

        guard status != .syncing else {
            logger.info("syncNow skipped: already in progress")
            return
        }

        status = .syncing
        lastError = nil

        let cycleStart = Date()
        logger.info("""
            Sync cycle started — server: \(self.settings.syncServerUrl, privacy: .public), \
            watermark: \(self.settings.lastSyncedStartTime, format: .fixed(precision: 3), privacy: .public)
            """)

        do {
            let (totalSynced, batchCount) = try await drainBatches()
            let totalElapsed = Date().timeIntervalSince(cycleStart)
            lastSyncTime = Date()
            lastSyncCount = totalSynced
            status = .idle
            logger.info("""
                Sync cycle complete: \(totalSynced, privacy: .public) sessions in \
                \(batchCount, privacy: .public) batch(es), \
                took \(totalElapsed, format: .fixed(precision: 2), privacy: .public)s
                """)
        } catch let error as SyncError {
            handleSyncError(error)
        } catch {
            let nsError = error as NSError
            let elapsed = Date().timeIntervalSince(cycleStart)
            lastError = error.localizedDescription
            status = .error(error.localizedDescription)
            logger.error("""
                Sync failed after \(elapsed, format: .fixed(precision: 2), privacy: .public)s — \
                domain=\(nsError.domain, privacy: .public) code=\(nsError.code, privacy: .public) \
                desc=\(error.localizedDescription, privacy: .public)
                """)
        }
    }

    /// Upload sessions in batches of `batchSize` until all pending sessions are drained.
    /// Returns (totalSynced, batchCount).
    private func drainBatches() async throws -> (Int, Int) {
        var totalSynced = 0
        var batchNumber = 0
        let database = db
        let batchSize = Self.batchSize

        while true {
            batchNumber += 1

            // Fetch unsynced sessions on a background thread to avoid
            // blocking MainActor with synchronous SQLite reads.
            let sessions: [FocusSession] = try await Task.detached(priority: .userInitiated) {
                try database.fetchUnsynced(limit: batchSize)
            }.value

            if sessions.isEmpty {
                if batchNumber == 1 {
                    logger.info("drainBatches: nothing to sync (no rows with synced_at IS NULL)")
                }
                break
            }

            let firstTime = sessions.first?.startTime ?? 0
            let lastTime = sessions.last?.startTime ?? 0
            logger.info("""
                Batch \(batchNumber, privacy: .public): \(sessions.count, privacy: .public) sessions \
                [startTime \(firstTime, format: .fixed(precision: 3), privacy: .public)…\
                \(lastTime, format: .fixed(precision: 3), privacy: .public)]
                """)

            let batchStart = Date()
            let result = try await uploadBatch(sessions)
            let elapsed = Date().timeIntervalSince(batchStart)

            logger.info("""
                Batch \(batchNumber, privacy: .public) done in \
                \(elapsed, format: .fixed(precision: 2), privacy: .public)s — \
                accepted: \(result.accepted, privacy: .public), \
                syncId: \(result.syncId, privacy: .public)
                """)

            totalSynced += result.accepted

            // Mark only this batch synced. A timeout or 5xx above would have
            // thrown and skipped this — the rows stay unsynced for the next
            // cycle to retry. The server's INSERT OR IGNORE on session.id
            // keeps any incidental duplicates harmless.
            let ids = sessions.map(\.id)
            let now = Date().timeIntervalSince1970
            try await Task.detached(priority: .userInitiated) {
                try database.markSynced(ids: ids, at: now)
            }.value
            logger.info("Batch \(batchNumber, privacy: .public) markSynced succeeded for \(ids.count, privacy: .public) ids")
            // Keep the legacy watermark current for UI/diagnostics.
            if let lastSession = sessions.last,
               lastSession.startTime > settings.lastSyncedStartTime {
                settings.lastSyncedStartTime = lastSession.startTime
            }

            // If we got fewer than the batch size, we're done
            if sessions.count < batchSize {
                break
            }
        }

        return (totalSynced, batchNumber)
    }

    // MARK: - HTTP Upload

    /// Upload a batch of sessions to the sync endpoint.
    private func uploadBatch(_ sessions: [FocusSession]) async throws -> SyncResponse {
        // swiftlint:disable:previous function_body_length
        guard let url = URL(string: "\(settings.syncServerUrl)/api/sync") else {
            logger.error("Invalid sync URL: \(self.settings.syncServerUrl, privacy: .public)")
            throw SyncError.badRequest("Invalid server URL: \(settings.syncServerUrl)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")
        // Stick to HTTP/2 over TCP — see init() comment on `.ephemeral` config.
        request.assumesHTTP3Capable = false

        let payload = SyncPayload(sessions: sessions.map(SyncSessionDTO.init))
        let body = try JSONEncoder().encode(payload)
        request.httpBody = body

        let bodyKB = Double(body.count) / 1024.0
        logger.info("""
            POST \(url.absoluteString, privacy: .public) — \
            \(sessions.count, privacy: .public) sessions, \
            \(bodyKB, format: .fixed(precision: 1), privacy: .public) KB
            """)

        let uploadStart = Date()
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            let nsError = error as NSError
            let elapsed = Date().timeIntervalSince(uploadStart)
            logger.error("""
                uploadBatch network failure after \
                \(elapsed, format: .fixed(precision: 2), privacy: .public)s — \
                domain=\(nsError.domain, privacy: .public) code=\(nsError.code, privacy: .public) \
                desc=\(error.localizedDescription, privacy: .public)
                """)
            throw error
        }
        let netElapsed = Date().timeIntervalSince(uploadStart)

        guard let httpResponse = response as? HTTPURLResponse else {
            logger.error("uploadBatch: response is not HTTPURLResponse (type=\(type(of: response), privacy: .public))")
            throw SyncError.invalidResponse
        }

        let statusCode = httpResponse.statusCode
        logger.info("""
            uploadBatch received HTTP \(statusCode, privacy: .public) in \
            \(netElapsed, format: .fixed(precision: 2), privacy: .public)s, \
            body \(data.count, privacy: .public) bytes
            """)

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
