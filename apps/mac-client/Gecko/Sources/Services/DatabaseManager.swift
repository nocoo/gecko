import Foundation
import GRDB
import os.log

/// Abstract interface for focus session persistence.
///
/// Extracted from `DatabaseManager` to enable testing with mock implementations.
/// All methods are synchronous and throw on failure.
protocol DatabaseService: Sendable {
    func insert(_ session: FocusSession) throws
    func update(_ session: FocusSession) throws
    func save(_ session: FocusSession) throws
    func fetchRecent(limit: Int) throws -> [FocusSession]
    func fetch(id: String) throws -> FocusSession?
    func fetchUnsynced(limit: Int) throws -> [FocusSession]
    func markSynced(ids: [String], at timestamp: Double) throws
    func clearSyncedState() throws
    func unsyncedCount() throws -> Int
    func count() throws -> Int
    func deleteAll() throws
}

/// Manages the SQLite database lifecycle and provides CRUD operations for FocusSession.
///
/// Database path: `~/Library/Application Support/ai.hexly.gecko/gecko.sqlite`
/// This path is accessible without sandbox, and will also be readable by the future web dashboard.
final class DatabaseManager: DatabaseService {

    /// Shared singleton for app-wide use.
    static let shared = DatabaseManager()

    /// The underlying GRDB database queue (thread-safe).
    let dbQueue: DatabaseQueue

    private static let logger = Logger(subsystem: "ai.hexly.gecko", category: "DatabaseManager")

    // MARK: - Init

    /// Initialize with the production database path.
    /// If the database cannot be opened or migrated, the app will log the error
    /// and create a temporary in-memory database as a fallback to avoid crashing.
    init() {
        do {
            let dbQueue = try Self.openDatabase(at: Self.databaseURL)
            self.dbQueue = dbQueue
            Self.logger.info("Database opened at \(Self.databaseURL.path)")
        } catch {
            Self.logger.fault("Failed to open database at \(Self.databaseURL.path): \(error). Falling back to in-memory DB.")
            // Fallback: in-memory DB so the app can still launch (data won't persist)
            do {
                var config = Configuration()
                config.foreignKeysEnabled = true
                let fallbackQueue = try DatabaseQueue(configuration: config)
                try Self.migrate(fallbackQueue)
                self.dbQueue = fallbackQueue
            } catch {
                // If even an in-memory DB fails, we have no choice
                fatalError("Cannot create even an in-memory database: \(error)")
            }
        }
    }

    /// Initialize with a custom database queue (for testing with in-memory DB).
    init(dbQueue: DatabaseQueue) {
        self.dbQueue = dbQueue
    }

    // MARK: - Database Setup

    /// The production database file URL.
    static var databaseURL: URL {
        guard let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            logger.fault("Application Support directory not found — using temporary directory")
            return FileManager.default.temporaryDirectory
                .appendingPathComponent("ai.hexly.gecko", isDirectory: true)
                .appendingPathComponent("gecko.sqlite")
        }
        let directory = appSupport.appendingPathComponent("ai.hexly.gecko", isDirectory: true)
        return directory.appendingPathComponent("gecko.sqlite")
    }

    /// Open (or create) the database at the given URL and run migrations.
    static func openDatabase(at url: URL) throws -> DatabaseQueue {
        // Ensure the directory exists
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        logger.debug("Database directory ensured: \(directory.path)")

        var config = Configuration()
        config.foreignKeysEnabled = true
        config.prepareDatabase { db in
            // WAL mode for better concurrent read performance
            try db.execute(sql: "PRAGMA journal_mode = WAL")
        }

        let dbQueue = try DatabaseQueue(path: url.path, configuration: config)
        try migrate(dbQueue)
        logger.info("Database migrations complete")
        return dbQueue
    }

    /// Create an in-memory database for testing.
    static func makeInMemory() throws -> DatabaseManager {
        var config = Configuration()
        config.foreignKeysEnabled = true
        let dbQueue = try DatabaseQueue(configuration: config)
        try migrate(dbQueue)
        return DatabaseManager(dbQueue: dbQueue)
    }

    /// Run database migrations.
    private static func migrate(_ dbQueue: DatabaseQueue) throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_create_focus_sessions") { db in
            try db.create(table: "focus_sessions", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("app_name", .text).notNull()
                t.column("window_title", .text).notNull()
                t.column("url", .text)
                t.column("start_time", .double).notNull()
                t.column("end_time", .double).notNull()
                t.column("duration", .double).notNull().defaults(to: 0)
            }
        }

        migrator.registerMigration("v2_add_rich_context") { db in
            try db.alter(table: "focus_sessions") { t in
                t.add(column: "bundle_id", .text)
                t.add(column: "tab_title", .text)
                t.add(column: "tab_count", .integer)
                t.add(column: "document_path", .text)
                t.add(column: "is_full_screen", .boolean).defaults(to: false)
                t.add(column: "is_minimized", .boolean).defaults(to: false)
            }
        }

        // v3: per-row sync tracking. NULL = not yet uploaded; a unix timestamp
        // means the row was 202-Accepted by the server. Replaces the global
        // start_time watermark, which couldn't survive a timeout: if a batch's
        // 202 was lost the watermark stayed put and the same 250 sessions kept
        // retrying forever. Marking each row individually means timeouts simply
        // leave the row's synced_at NULL — the next sync picks it up again.
        // The server's INSERT OR IGNORE on session.id keeps duplicates harmless.
        migrator.registerMigration("v3_per_row_sync_state") { db in
            try db.alter(table: "focus_sessions") { t in
                t.add(column: "synced_at", .double)
            }
            try db.create(
                index: "idx_focus_sessions_unsynced",
                on: "focus_sessions",
                columns: ["start_time"],
                condition: Column("synced_at") == nil
            )
        }

        try migrator.migrate(dbQueue)
    }

    // MARK: - Write Operations

    /// Insert a new focus session.
    func insert(_ session: FocusSession) throws {
        try dbQueue.write { db in
            try session.insert(db)
        }
    }

    /// Update an existing focus session (e.g., to finalize end_time and duration).
    func update(_ session: FocusSession) throws {
        try dbQueue.write { db in
            try session.update(db)
        }
    }

    /// Save (insert or update) a focus session.
    func save(_ session: FocusSession) throws {
        try dbQueue.write { db in
            try session.save(db)
        }
    }

    /// Delete all sessions (useful for testing/debug).
    func deleteAll() throws {
        try dbQueue.write { db in
            _ = try FocusSession.deleteAll(db)
        }
    }

    // MARK: - Read Operations

    /// Fetch the most recent sessions, ordered by start_time descending.
    func fetchRecent(limit: Int = 50) throws -> [FocusSession] {
        try dbQueue.read { db in
            try FocusSession
                .order(FocusSession.Columns.startTime.desc)
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// Fetch a single session by ID.
    func fetch(id: String) throws -> FocusSession? {
        try dbQueue.read { db in
            try FocusSession.fetchOne(db, key: id)
        }
    }

    /// Count total sessions.
    func count() throws -> Int {
        try dbQueue.read { db in
            try FocusSession.fetchCount(db)
        }
    }

    /// Fetch finalized sessions that have not yet been uploaded to the server,
    /// ordered ascending by `start_time`.
    ///
    /// "Unsynced" means `synced_at IS NULL`. Sessions are only returned once
    /// `duration > 0` (i.e. finalized).
    func fetchUnsynced(limit: Int = 250) throws -> [FocusSession] {
        try dbQueue.read { db in
            try FocusSession
                .filter(FocusSession.Columns.syncedAt == nil)
                .filter(FocusSession.Columns.duration > 0)
                .order(FocusSession.Columns.startTime.asc)
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// Count rows still pending upload (`synced_at IS NULL`, finalized).
    /// Powers the Settings UI progress display.
    func unsyncedCount() throws -> Int {
        try dbQueue.read { db in
            try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM focus_sessions WHERE synced_at IS NULL AND duration > 0"
            ) ?? 0
        }
    }

    /// Mark the given session ids as successfully synced at `timestamp`.
    ///
    /// Idempotent — re-marking already-synced rows just refreshes `synced_at`.
    /// No-op when `ids` is empty.
    func markSynced(ids: [String], at timestamp: Double = Date().timeIntervalSince1970) throws {
        guard !ids.isEmpty else { return }
        try dbQueue.write { db in
            let placeholders = databaseQuestionMarks(count: ids.count)
            let sql = "UPDATE focus_sessions SET synced_at = ? WHERE id IN (\(placeholders))"
            var args: [DatabaseValueConvertible] = [timestamp]
            args.append(contentsOf: ids)
            try db.execute(sql: sql, arguments: StatementArguments(args))
        }
    }

    /// Clear `synced_at` on every row so the next sync cycle re-uploads
    /// everything from scratch. Backs the "Reset sync state" Settings action.
    /// The server's INSERT OR IGNORE on session.id keeps the re-upload safe.
    func clearSyncedState() throws {
        try dbQueue.write { db in
            try db.execute(sql: "UPDATE focus_sessions SET synced_at = NULL")
        }
    }

    /// Backfill `synced_at` for rows whose `start_time` is at or before
    /// `throughStartTime`, but only when no row has been individually marked
    /// yet. Used once after upgrading from the watermark-based scheme to
    /// per-row tracking — avoids retransmitting tens of thousands of rows
    /// that the server already has. Returns the number of rows updated.
    @discardableResult
    func backfillSyncedFromWatermark(throughStartTime: Double, at timestamp: Double) throws -> Int {
        try dbQueue.write { db in
            // Skip when any row already carries individual state; that means
            // the new scheme is already authoritative.
            let alreadyTracked = try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM focus_sessions WHERE synced_at IS NOT NULL"
            ) ?? 0
            if alreadyTracked > 0 { return 0 }
            try db.execute(
                sql: """
                UPDATE focus_sessions
                   SET synced_at = ?
                 WHERE synced_at IS NULL AND start_time <= ?
                """,
                arguments: [timestamp, throughStartTime]
            )
            return db.changesCount
        }
    }
}
