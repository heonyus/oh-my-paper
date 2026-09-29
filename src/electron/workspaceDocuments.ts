import type { DatabaseSync } from "node:sqlite"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import { type DocumentId, type DocumentRecord, documentRecordSchema } from "../shared/schemas"
import { rowToNode } from "./knowledgeRepositoryRows"

/** The library record a paper node carries, titled and summarised by the node itself. */
export function documentOfPaperNode(paper: KnowledgeNode): DocumentRecord | null {
  const candidate =
    typeof paper.metadata === "object" &&
    paper.metadata !== null &&
    "documentRecord" in paper.metadata
      ? Reflect.get(paper.metadata, "documentRecord")
      : null
  if (!candidate) return null
  const parsed = documentRecordSchema.safeParse(candidate)
  if (!parsed.success) return null
  return documentRecordSchema.parse({ ...parsed.data, title: paper.title, overview: paper.body })
}

function documentsOfRows(rows: readonly unknown[]): readonly DocumentRecord[] {
  return rows.flatMap((row) => {
    const document = documentOfPaperNode(rowToNode(row))
    return document ? [document] : []
  })
}

/** Every library record, most recently updated first, in one query. */
export function readLibraryDocuments(db: DatabaseSync): readonly DocumentRecord[] {
  return documentsOfRows(
    db.prepare("SELECT * FROM knowledge_nodes WHERE kind = 'paper' ORDER BY updated_at DESC").all(),
  )
}

/**
 * The record for `id`, matched inside SQLite so only that paper's row is parsed. It returns
 * what the workspace projection would list for `id`: the most recently updated match.
 */
export function readLibraryDocument(db: DatabaseSync, id: DocumentId): DocumentRecord | null {
  const rows = db
    .prepare(`
      SELECT * FROM knowledge_nodes
      WHERE kind = 'paper' AND json_extract(metadata_json, '$.documentRecord.id') = ?
      ORDER BY updated_at DESC
    `)
    .all(id)
  return documentsOfRows(rows).find((document) => document.id === id) ?? null
}
