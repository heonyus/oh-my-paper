import { copyFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  CollectionFiles,
  createCanonicalNoteBytes,
  initialNoteRelativePath,
} from "./collectionFiles"
import { revisionOf } from "./collectionJournal"
import { collectionMetadataFile } from "./collectionPaths"
import { openKnowledgeDatabase } from "./knowledgeDatabase"
import { migrateLegacyWorkspaceIfPresent } from "./knowledgeLegacyMigration"
import { KnowledgeRepository } from "./knowledgeRepository"
import { docVersionRowSchema, nodeRowSchema } from "./knowledgeRepositoryRows"

const countSchema = z.object({ count: z.number().int().nonnegative() })

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

export async function migrateCollectionContents(
  legacyRoot: string,
  stagingRoot: string,
  backupWorkspace: string,
  hasLegacyWorkspace: boolean,
): Promise<{ readonly noteCount: number; readonly missingPdfVersionIds: readonly string[] }> {
  const db = openKnowledgeDatabase(collectionMetadataFile(stagingRoot))
  let files: CollectionFiles | null = null
  try {
    const repository = new KnowledgeRepository(db)
    const nodeCount = countSchema.parse(
      db.prepare("SELECT COUNT(*) AS count FROM knowledge_nodes").get(),
    ).count
    if (nodeCount === 0 && hasLegacyWorkspace) {
      await migrateLegacyWorkspaceIfPresent(backupWorkspace, repository, db)
    }
    db.prepare("UPDATE legacy_migration_markers SET source_file = 'legacy-workspace.json'").run()
    files = await CollectionFiles.open(stagingRoot)
    const noteRows = db
      .prepare("SELECT * FROM knowledge_nodes WHERE kind = 'note' ORDER BY id")
      .all()
      .map((row) => nodeRowSchema.parse(row))
    for (const row of noteRows) {
      const saved = await files.saveNote({
        relativePath: initialNoteRelativePath(row.id),
        bytes: createCanonicalNoteBytes(row.id, row.body),
        expectedRevision: null,
        reason: "explicit_save",
      })
      if (saved.kind !== "saved") throw new Error(`Could not migrate note: ${row.id}`)
    }
    clearPortableNoteBodies(db)
    const missingPdfVersionIds = await migratePdfs(legacyRoot, stagingRoot, db)
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    return { noteCount: noteRows.length, missingPdfVersionIds }
  } finally {
    try {
      db.close()
    } finally {
      await files?.close()
    }
  }
}

function clearPortableNoteBodies(db: import("node:sqlite").DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("UPDATE knowledge_nodes SET body = '' WHERE kind = 'note'").run()
    db.prepare(
      "DELETE FROM knowledge_nodes_fts WHERE id IN (SELECT id FROM knowledge_nodes WHERE kind = 'note')",
    ).run()
    db.prepare(`INSERT INTO knowledge_nodes_fts (id, title, body, aliases)
      SELECT id, title, '', replace(replace(aliases_json, '[', ''), ']', '')
      FROM knowledge_nodes WHERE kind = 'note'`).run()
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

async function migratePdfs(
  legacyRoot: string,
  collectionRoot: string,
  db: import("node:sqlite").DatabaseSync,
): Promise<readonly string[]> {
  const missing: string[] = []
  const rows = db
    .prepare("SELECT * FROM document_versions ORDER BY id")
    .all()
    .map((row) => docVersionRowSchema.parse(row))
  for (const row of rows) {
    const source = join(legacyRoot, "documents", `${row.hash}.pdf`)
    if (!(await exists(source))) {
      missing.push(row.id)
      continue
    }
    const bytes = await readFile(source)
    if (revisionOf(bytes) !== row.hash) throw new Error(`Legacy PDF hash mismatch: ${row.id}`)
    await copyFile(source, join(collectionRoot, "papers", `${row.id}.pdf`))
  }
  return missing
}
