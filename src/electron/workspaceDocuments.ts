import type { DatabaseSync } from "node:sqlite"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import {
  type DocumentId,
  type DocumentRecord,
  documentRecordSchema,
  type Sha256,
} from "../shared/schemas"
import { rowToNode } from "./knowledgeRepositoryRows"
import { deepFrozen, type RowMemo, rowKey } from "./knowledgeRowMemo"
import { cachedStatement } from "./knowledgeStatements"

const titleSchema = documentRecordSchema.shape.title
const overviewSchema = documentRecordSchema.shape.overview

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
  return {
    ...parsed.data,
    title: titleSchema.parse(paper.title),
    overview: overviewSchema.parse(paper.body),
  }
}

function documentsOfNodes(nodes: readonly KnowledgeNode[]): readonly DocumentRecord[] {
  return nodes.flatMap((node) => {
    const document = documentOfPaperNode(node)
    return document ? [document] : []
  })
}

/** Newest first; the stable sort keeps equal timestamps in row order, as SQLite's sort did. */
function newestNodesFirst(rows: readonly unknown[]): readonly KnowledgeNode[] {
  return rows
    .map((row) => rowToNode(row))
    .sort((left, right) =>
      left.updatedAt === right.updatedAt ? 0 : left.updatedAt < right.updatedAt ? 1 : -1,
    )
}

/**
 * Every library record, most recently updated first, in one query. With a memo carried
 * between calls, unchanged papers keep their previous (frozen) record without a JSON parse.
 */
export function readLibraryDocuments(
  db: DatabaseSync,
  memo?: RowMemo<DocumentRecord | null>,
): readonly DocumentRecord[] {
  const rows = cachedStatement(
    db,
    "SELECT * FROM knowledge_nodes WHERE kind = 'paper' ORDER BY updated_at DESC",
  ).all()
  const derive = (row: unknown): DocumentRecord | null => documentOfPaperNode(rowToNode(row))
  const documents = memo
    ? memo.map(
        rows,
        (row) => rowKey(row, "id"),
        (row) => deepFrozen(derive(row)),
      )
    : rows.map(derive)
  return documents.flatMap((document) => (document ? [document] : []))
}

/**
 * Paper rows whose record has this id, matching idx_nodes_paper_document_id term for term. It
 * has no ORDER BY because SQLite would then walk the (kind, updated_at) index over every paper.
 */
export const PAPER_ROWS_BY_DOCUMENT_ID = `SELECT * FROM knowledge_nodes
  WHERE kind = 'paper' AND json_valid(metadata_json)
    AND json_extract(metadata_json, '$.documentRecord.id') = ?`

/** Paper rows whose record has this hash, matching idx_nodes_paper_document_hash. */
export const PAPER_ROWS_BY_DOCUMENT_HASH = `SELECT * FROM knowledge_nodes
  WHERE kind = 'paper' AND json_valid(metadata_json)
    AND json_extract(metadata_json, '$.documentRecord.hash') = ?`

/** The record for `id` as the projection lists it: the most recently updated match. */
export function readLibraryDocument(db: DatabaseSync, id: DocumentId): DocumentRecord | null {
  const rows = cachedStatement(db, PAPER_ROWS_BY_DOCUMENT_ID).all(id)
  return documentsOfNodes(newestNodesFirst(rows)).find((document) => document.id === id) ?? null
}

/** The record the projection would list first for `hash`. */
export function readLibraryDocumentByHash(db: DatabaseSync, hash: Sha256): DocumentRecord | null {
  const rows = cachedStatement(db, PAPER_ROWS_BY_DOCUMENT_HASH).all(hash)
  return documentsOfNodes(newestNodesFirst(rows)).find((document) => document.hash === hash) ?? null
}
