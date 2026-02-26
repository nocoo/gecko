import Foundation
import GRDB

/// Manages the SQLite database lifecycle and provides CRUD operations for FocusSession.
///
/// Database path: `~/Library/Application Support/com.gecko.app/gecko.sqlite`
/// This path is accessible without sandbox, and will also be readable by the future web dashboard.
final class DatabaseManager: Sendable {

    /// Shared singleton for app-wide use.
    static let shared = DatabaseManager()

    /// The underlying GRDB database queue (thread-safe).
    let dbQueue: DatabaseQueue

    // MARK: - Init

    /// Initialize with the production database path.
    init() {
        do {
            let dbQueue = try Self.openDatabase(at: Self.databaseURL)
            self.dbQueue = dbQueue
        } catch {
            fatalError("Failed to initialize database: \(error)")
        }
    }

    /// Initialize with a custom database queue (for testing with in-memory DB).
    init(dbQueue: DatabaseQueue) {
        self.dbQueue = dbQueue
    }

    // MARK: - Database Setup

    /// The production database file URL.
    static var databaseURL: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let directory = appSupport.appendingPathComponent("com.gecko.app", isDirectory: true)
        return directory.appendingPathComponent("gecko.sqlite")
    }

    /// Open (or create) the database at the given URL and run migrations.
    static func openDatabase(at url: URL) throws -> DatabaseQueue {
        // Ensure the directory exists
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        var config = Configuration()
        config.foreignKeysEnabled = true
        config.prepareDatabase { db in
            // WAL mode for better concurrent read performance
            try db.execute(sql: "PRAGMA journal_mode = WAL")
        }

        let dbQueue = try DatabaseQueue(path: url.path, configuration: config)
        try migrate(dbQueue)
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
}
