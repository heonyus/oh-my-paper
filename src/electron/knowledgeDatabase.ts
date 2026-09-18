import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { schemaVersionRowSchema } from "./knowledgeRepositoryRows"
import { KNOWLEDGE_SCHEMA_SQL, KNOWLEDGE_SCHEMA_VERSION } from "./knowledgeSchemaSql"

export function openKnowledgeDatabase(filePath: string): DatabaseSync {
  if (filePath !== ":memory:") {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  const db = new DatabaseSync(filePath)
  db.exec("PRAGMA foreign_keys = ON;")
  db.exec("PRAGMA journal_mode = WAL;")
  migrateDatabase(db)
  return db
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
      const stmt = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      stmt.run(KNOWLEDGE_SCHEMA_VERSION, new Date().toISOString())
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
}
