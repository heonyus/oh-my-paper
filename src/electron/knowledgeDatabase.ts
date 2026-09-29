import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { schemaVersionRowSchema } from "./knowledgeRepositoryRows"
import { KNOWLEDGE_SCHEMA_SQL, KNOWLEDGE_SCHEMA_VERSION } from "./knowledgeSchemaSql"

const CONNECTION_PRAGMAS = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  -- With WAL, NORMAL survives application crashes; a power loss can undo only the last commits.
  PRAGMA synchronous = NORMAL;
  -- Wait for another connection's write (a second instance, a backup) instead of failing at once.
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  -- 16 MiB instead of the 2 MiB default, so a large library's rows stay cached between reads.
  PRAGMA cache_size = -16384;
`

export function openKnowledgeDatabase(filePath: string): DatabaseSync {
  if (filePath !== ":memory:") {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  const db = new DatabaseSync(filePath)
  db.exec(CONNECTION_PRAGMAS)
  migrateDatabase(db)
  return db
}

/** Lets SQLite refresh its planner statistics, then closes the connection. */
export function closeKnowledgeDatabase(db: DatabaseSync): void {
  optimizeKnowledgeDatabase(db)
  db.close()
}

/** Runs `PRAGMA optimize`; it is advisory, so a failure never blocks closing. */
export function optimizeKnowledgeDatabase(db: DatabaseSync): void {
  try {
    db.exec("PRAGMA optimize")
  } catch {
    // A busy or read-only database keeps its previous statistics.
  }
}

/**
 * Collapses the per-save `projection-<time>` markers older versions appended into one stable
 * marker per source file, so the legacy import stays suppressed without the table growing.
 */
function consolidateProjectionMarkers(db: DatabaseSync): void {
  db.exec(`
    INSERT OR IGNORE INTO legacy_migration_markers (id, migrated_at, source_file, node_count)
    SELECT 'projection:' || source_file, MAX(migrated_at), source_file, node_count
    FROM legacy_migration_markers WHERE id LIKE 'projection-%' GROUP BY source_file;
    DELETE FROM legacy_migration_markers WHERE id LIKE 'projection-%';
  `)
}

function migrateDatabase(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const rawRow = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()
  const rowParsed = schemaVersionRowSchema.safeParse(rawRow)
  const versionNum =
    rowParsed.success && rowParsed.data.version !== null ? rowParsed.data.version : 0

  if (versionNum > KNOWLEDGE_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${versionNum} is higher than supported version ${KNOWLEDGE_SCHEMA_VERSION}`,
    )
  }

  if (versionNum < KNOWLEDGE_SCHEMA_VERSION) {
    db.exec("BEGIN IMMEDIATE")
    try {
      db.exec(KNOWLEDGE_SCHEMA_SQL)
      if (versionNum === 1) {
        db.exec("ALTER TABLE knowledge_relations ADD COLUMN source_endpoint_json TEXT")
        db.exec("ALTER TABLE knowledge_relations ADD COLUMN target_endpoint_json TEXT")
      }
      consolidateProjectionMarkers(db)
      const stmt = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      stmt.run(KNOWLEDGE_SCHEMA_VERSION, new Date().toISOString())
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
}
