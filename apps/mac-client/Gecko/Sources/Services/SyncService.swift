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
// swiftlint:disable:next type_body_length
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

    /// Number of unsynced rows in the local DB (UI progress display).
    /// Refreshed at the start of each sync cycle and after each batch.
    @Published private(set) var pendingCount: Int = 0

    /// Per-cycle progress: count of sessions successfully uploaded since the
    /// current cycle began. Resets to 0 on every cycle start.
    @Published private(set) var cycleProgress: Int = 0

    // MARK: - Status Enum

    enum SyncStatus: Equatable {
        case idle
        case syncing
        case error(String)
        case disabled
    }

    // MARK: - Constants

    /// Sessions per upload batch. Matches the server-side MAX_BATCH_SIZE; the
    /// drain loop pages through the unsynced rows in chunks this size.
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
            #if DEBUG
            // DEBUG: trust local CAs (mkcert) via a delegate.
            let delegate = SyncSessionDelegate()
            self.sessionDelegate = delegate
            self.session = URLSession(
                configuration: .default,
                delegate: delegate,
                delegateQueue: nil
            )
            #else
            // RELEASE: use the global shared session. v1.10.2…v1.10.8 created
            // a custom URLSession to tweak timeouts/pipelining/etc.; on some
            // setups every POST data-stalled at ~3 s and timed out at 30 s
            // while the EXACT same config in a shell `swift` script returned
            // <1 s. `URLSession.shared` shares NSURLSessionTask scheduling
            // with the rest of the system (Network.framework "modern loader")
            // and never reproduced the stall. Stick with it.
            self.sessionDelegate = nil
            self.session = .shared
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
        // swiftlint:disable:previous function_body_length
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
        cycleProgress = 0
        await refreshPendingCount()

        let cycleStart = Date()
        logger.info("""
            Sync cycle started — \(self.pendingCount, privacy: .public) pending, \
            server: \(self.settings.syncServerUrl, privacy: .public)
            """)

        do {
            let result = try await drainBatches()
            let totalElapsed = Date().timeIntervalSince(cycleStart)
            await refreshPendingCount()
            lastSyncTime = Date()
            lastSyncCount = result.synced
            status = .idle
            if result.failed > 0 {
                lastError = "\(result.failed) batch(es) failed — will retry"
            } else {
                // Clear any stale failure from the prior cycle so the UI flips
                // back to green once the network recovers.
                lastError = nil
            }
            logger.info("""
                Sync cycle complete: \(result.synced, privacy: .public) synced, \
                \(result.failed, privacy: .public) batches failed, \
                \(result.batches, privacy: .public) total batches, \
                took \(totalElapsed, format: .fixed(precision: 2), privacy: .public)s
                """)
        } catch let error as SyncError {
            handleSyncError(error)
        } catch {
            let nsError = error as NSError
            lastError = error.localizedDescription
            status = .error(error.localizedDescription)
            logger.error("""
                Sync cycle aborted — domain=\(nsError.domain, privacy: .public) \
                code=\(nsError.code, privacy: .public) \
                desc=\(error.localizedDescription, privacy: .public)
                """)
        }
    }

    /// Refresh `pendingCount` from the database. Runs the SQLite read on a
    /// background queue to keep the MainActor responsive.
    private func refreshPendingCount() async {
        let database = db
        let count = (try? await Task.detached(priority: .utility) {
            try database.unsyncedCount()
        }.value) ?? pendingCount
        pendingCount = count
    }

    /// Aggregate result of a sync cycle's batch loop.
    private struct DrainResult {
        let synced: Int
        let batches: Int
        let failed: Int
    }

    /// Upload sessions in batches of `batchSize` until all pending sessions are
    /// drained or the cycle is told to stop. A 401 still bubbles up (kills the
    /// timer); other transient batch failures get logged and we walk past them
    /// via an offset so one bad/wedged batch doesn't block the whole backlog.
    /// We cap failed batches per cycle so a totally broken network doesn't
    /// burn 28 × 30 s = 14 minutes on a single timer tick.
    private func drainBatches() async throws -> DrainResult {
        // swiftlint:disable:previous function_body_length
        var totalSynced = 0
        var batchNumber = 0
        var failed = 0
        var offset = 0
        let database = db
        let batchSize = Self.batchSize
        let maxFailedBatchesPerCycle = 3

        while true {
            batchNumber += 1

            let currentOffset = offset
            let sessions: [FocusSession] = try await Task.detached(priority: .userInitiated) {
                try database.fetchUnsynced(limit: batchSize, offset: currentOffset)
            }.value

            if sessions.isEmpty {
                if batchNumber == 1 {
                    logger.info("drainBatches: nothing to sync")
                }
                batchNumber -= 1 // we didn't actually run this batch
                break
            }

            logger.info("""
                Batch \(batchNumber, privacy: .public) (offset \(offset, privacy: .public)): \
                uploading \(sessions.count, privacy: .public) sessions
                """)

            let batchStart = Date()
            let result: SyncResponse
            do {
                result = try await uploadBatch(sessions)
            } catch SyncError.unauthorized {
                // Bubble up — handleSyncError stops the timer.
                throw SyncError.unauthorized
            } catch {
                let elapsed = Date().timeIntervalSince(batchStart)
                let nsError = error as NSError
                logger.warning("""
                    Batch \(batchNumber, privacy: .public) failed after \
                    \(elapsed, format: .fixed(precision: 2), privacy: .public)s — \
                    domain=\(nsError.domain, privacy: .public) \
                    code=\(nsError.code, privacy: .public) \
                    desc=\(error.localizedDescription, privacy: .public). \
                    Skipping past it.
                    """)
                failed += 1
                // Walk past this batch's rows so the next iteration tries the
                // NEXT 250, not the same 250 again. The skipped rows stay
                // unsynced and will be re-attempted on the next cycle.
                offset += sessions.count
                if failed >= maxFailedBatchesPerCycle {
                    logger.warning("""
                        Cycle aborted: \(failed, privacy: .public) batches failed in a row, \
                        bailing to next tick
                        """)
                    break
                }
                continue
            }
            let elapsed = Date().timeIntervalSince(batchStart)

            // Mark only this batch's ids synced. The server's INSERT OR IGNORE
            // on session.id makes any duplicate re-send harmless.
            let ids = sessions.map(\.id)
            let now = Date().timeIntervalSince1970
            try await Task.detached(priority: .userInitiated) {
                try database.markSynced(ids: ids, at: now)
            }.value

            totalSynced += result.accepted
            cycleProgress += result.accepted
            await refreshPendingCount()
            // Successful batch removed `sessions.count` rows from the unsynced
            // queue, so the next fetch with the SAME offset already starts
            // past any skipped rows ahead. Keep offset where it is.
            logger.info("""
                Batch \(batchNumber, privacy: .public) done in \
                \(elapsed, format: .fixed(precision: 2), privacy: .public)s — \
                accepted: \(result.accepted, privacy: .public), \
                cycle progress: \(self.cycleProgress, privacy: .public), \
                still pending: \(self.pendingCount, privacy: .public)
                """)

            // If we got fewer than the batch size, we're done
            if sessions.count < batchSize {
                break
            }
        }

        return DrainResult(synced: totalSynced, batches: batchNumber, failed: failed)
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
