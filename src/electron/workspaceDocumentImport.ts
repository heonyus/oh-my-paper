import type { DatabaseSync } from "node:sqlite"
import type { DocumentRecord } from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { cachedStatement } from "./knowledgeStatements"
import { applyDocuments } from "./knowledgeWorkspaceApply"
import { readLibraryDocument, readLibraryDocumentByHash } from "./workspaceDocuments"

export type LibraryImport = { readonly document: DocumentRecord; readonly duplicate: boolean }

/**
 * Adds an imported PDF's record and makes it the active document in one transaction, touching
 * only that paper instead of syncing the whole workspace. A known hash returns the stored record.
 */
export function importLibraryDocument(
  repo: KnowledgeRepository,
  db: DatabaseSync,
  document: DocumentRecord,
): LibraryImport {
  if (repo.findDocumentVersionsByHash(document.hash).length > 0) {
    const existing = readLibraryDocumentByHash(db, document.hash)
    if (existing) return { document: existing, duplicate: true }
  }
  const current = readLibraryDocument(db, document.id)
  db.exec("BEGIN IMMEDIATE")
  try {
    const now = new Date().toISOString()
    // A missing row takes the column defaults, which match the defaults a full sync would write.
    cachedStatement(
      db,
      `INSERT INTO workspace_settings (id, active_document_id, revision, updated_at)
       VALUES (1, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         active_document_id = excluded.active_document_id,
         revision = workspace_settings.revision + 1,
         updated_at = excluded.updated_at`,
    ).run(document.id, now)
    applyDocuments(repo, [document], current ? [current] : [], now)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return { document, duplicate: false }
}
