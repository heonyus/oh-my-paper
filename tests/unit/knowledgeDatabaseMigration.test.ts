// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { closeKnowledgeDatabase, openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { KNOWLEDGE_SCHEMA_VERSION } from "../../src/electron/knowledgeSchemaSql"
import {
  PAPER_ROWS_BY_DOCUMENT_HASH,
  PAPER_ROWS_BY_DOCUMENT_ID,
} from "../../src/electron/workspaceDocuments"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"

const nameRowSchema = z.object({ name: z.string() })
const markerRowSchema = z.object({
  id: z.string(),
  source_file: z.string(),
  node_count: z.number(),
})
const versionRowSchema = z.object({ version: z.number() })
const planRowSchema = z.object({ detail: z.string() })

const roots: string[] = []
const V3_INDEXES = [
  "idx_nodes_kind_updated",
  "idx_nodes_paper_document_id",
  "idx_nodes_paper_document_hash",
  "idx_doc_versions_paper_node",
  "idx_ext_mapping_node",
]

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function databaseFile(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-schema-"))
  roots.push(root)
  return join(root, "knowledge.sqlite")
}

function indexNames(db: DatabaseSync): readonly string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all()
    .map((row) => nameRowSchema.parse(row).name)
}

function markers(db: DatabaseSync): readonly (readonly [string, string, number])[] {
  return db
    .prepare("SELECT id, source_file, node_count FROM legacy_migration_markers ORDER BY id")
    .all()
    .map((raw) => {
      const row = markerRowSchema.parse(raw)
      return [row.id, row.source_file, row.node_count] as const
    })
}

/** Rewinds a current database to the given older schema version, as it would have been left. */
function rewind(file: string, version: 1 | 2): void {
  const db = new DatabaseSync(file)
  for (const name of V3_INDEXES) db.exec(`DROP INDEX IF EXISTS ${name}`)
  if (version === 1) {
    db.exec("ALTER TABLE knowledge_relations DROP COLUMN source_endpoint_json")
    db.exec("ALTER TABLE knowledge_relations DROP COLUMN target_endpoint_json")
  }
  db.exec("DELETE FROM schema_migrations")
  db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
    version,
    "2026-09-01T00:00:00.000Z",
  )
  const marker = db.prepare(
    "INSERT INTO legacy_migration_markers (id, migrated_at, source_file, node_count) VALUES (?, ?, ?, ?)",
  )
  marker.run("mig-1", "2026-09-01T00:00:00.000Z", "/data/workspace.json", 2)
  for (let index = 0; index < 50; index += 1) {
    marker.run(`projection-${1000 + index}`, `2026-09-02T00:00:${10 + index}.000Z`, "/a", index)
  }
  marker.run("projection-9999", "2026-09-03T00:00:00.000Z", "/b", 7)
  db.close()
}

describe("knowledge database schema", () => {
  it.each([1, 2] as const)("migrates version %i to the current schema once", async (version) => {
    const file = await databaseFile()
    closeKnowledgeDatabase(openKnowledgeDatabase(file))
    rewind(file, version)

    const db = openKnowledgeDatabase(file)
    const expectedMarkers = [
      ["mig-1", "/data/workspace.json", 2],
      ["projection:/a", "/a", 49],
      ["projection:/b", "/b", 7],
    ]
    expect(indexNames(db)).toEqual(expect.arrayContaining(V3_INDEXES))
    expect(markers(db)).toEqual(expectedMarkers)
    const columns = db.prepare("PRAGMA table_info(knowledge_relations)").all()
    expect(columns.map((column) => nameRowSchema.parse(column).name)).toContain(
      "target_endpoint_json",
    )
    closeKnowledgeDatabase(db)

    const reopened = openKnowledgeDatabase(file)
    const versions = reopened.prepare("SELECT version FROM schema_migrations ORDER BY version")
    expect(versions.all().map((row) => versionRowSchema.parse(row).version)).toEqual([
      version,
      KNOWLEDGE_SCHEMA_VERSION,
    ])
    expect(markers(reopened)).toEqual(expectedMarkers)
    closeKnowledgeDatabase(reopened)
  })

  it("configures each connection for WAL with bounded waits and an in-memory temp store", async () => {
    const db = openKnowledgeDatabase(await databaseFile())
    const pragma = (name: string): unknown =>
      Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0]
    expect(pragma("journal_mode")).toBe("wal")
    expect(pragma("synchronous")).toBe(1)
    expect(pragma("busy_timeout")).toBe(5000)
    expect(pragma("temp_store")).toBe(2)
    expect(pragma("cache_size")).toBe(-16384)
    expect(pragma("foreign_keys")).toBe(1)
    closeKnowledgeDatabase(db)
  })

  it("finds a paper by document id or hash through their indexes, before and after ANALYZE", async () => {
    const db = openKnowledgeDatabase(await databaseFile())
    const insert = db.prepare(
      "INSERT INTO knowledge_nodes (id, kind, title, metadata_json, created_at, updated_at) VALUES (?, ?, 'T', ?, ?, ?)",
    )
    for (let index = 0; index < 300; index += 1) {
      const record = { documentRecord: { id: `doc-${index}`, hash: `hash-${index}` } }
      const kind = index % 3 === 0 ? "paper" : "note"
      insert.run(`n${index}`, kind, JSON.stringify(record), "2026-09-01", "2026-09-01")
    }
    const plan = (sql: string): string =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all("doc-3")
        .map((row) => planRowSchema.parse(row).detail)
        .join("\n")
    for (const pass of ["heuristic", "analyzed"]) {
      if (pass === "analyzed") db.exec("ANALYZE")
      expect(plan(PAPER_ROWS_BY_DOCUMENT_ID)).toContain("USING INDEX idx_nodes_paper_document_id")
      expect(plan(PAPER_ROWS_BY_DOCUMENT_HASH)).toContain(
        "USING INDEX idx_nodes_paper_document_hash",
      )
      expect(plan(PAPER_ROWS_BY_DOCUMENT_ID)).not.toMatch(/\bSCAN\b/)
    }
    closeKnowledgeDatabase(db)
  })

  it("keeps one stable projection marker however often the server-mode store saves", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-markers-"))
    roots.push(root)
    const store = new WorkspaceStore(root)
    let workspace = await store.save(defaultWorkspace())
    for (let index = 0; index < 5; index += 1) {
      workspace = await store.save({ ...workspace, outlineWidth: 240 + index })
    }
    expect(markers(store.db)).toEqual([
      [`projection:${store.workspaceFile}`, store.workspaceFile, 0],
    ])
    await store.close()

    const reopened = new WorkspaceStore(root)
    expect((await reopened.read()).outlineWidth).toBe(244)
    await reopened.close()
  })
})
