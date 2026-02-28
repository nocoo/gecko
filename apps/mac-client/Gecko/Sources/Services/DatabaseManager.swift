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
    func fetchUnsynced(since startTime: Double, limit: Int) throws -> [FocusSession]
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

    /// Fetch finalized sessions with start_time after the given watermark, ordered ascending.
    ///
    /// Used by SyncService to find sessions that haven't been synced yet.
    /// Only returns completed sessions (duration > 0).
    func fetchUnsynced(since startTime: Double, limit: Int = 1000) throws -> [FocusSession] {
        try dbQueue.read { db in
            try FocusSession
                .filter(FocusSession.Columns.startTime > startTime)
                .filter(FocusSession.Columns.duration > 0)
                .order(FocusSession.Columns.startTime.asc)
                .limit(limit)
                .fetchAll(db)
        }
    }
}
