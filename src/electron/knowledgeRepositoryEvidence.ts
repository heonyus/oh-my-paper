import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import {
  type DocumentVersionId,
  type DocumentVersionRecord,
  documentVersionRecordSchema,
  type EvidenceAnchor,
  type EvidenceAnchorId,
  evidenceAnchorIdSchema,
  evidenceAnchorSchema,
} from "../shared/knowledgeSchemas"
import type { CreateEvidenceAnchorInput, EvidenceNavigationTarget } from "../shared/knowledgeTypes"
import { withKnowledgeSavepoint } from "./knowledgeDatabaseTransaction"
import { executeGetEvidenceNavigation } from "./knowledgeRepositoryQueries"
import {
  anchorRowSchema,
  docVersionRowSchema,
  rowToAnchor,
  rowToDocVersion,
} from "./knowledgeRepositoryRows"
import { cachedStatement } from "./knowledgeStatements"

export class KnowledgeEvidenceOperations {
  constructor(private readonly db: DatabaseSync) {}

  createEvidenceAnchor(input: CreateEvidenceAnchorInput): EvidenceAnchor {
    return withKnowledgeSavepoint(this.db, () => {
      const rawVersion = cachedStatement(
        this.db,
        "SELECT * FROM document_versions WHERE id = ?",
      ).get(input.documentVersionId)
      if (!rawVersion) {
        throw new Error(`Document version not found: ${input.documentVersionId}`)
      }
      const version = rowToDocVersion(docVersionRowSchema.parse(rawVersion))
      const pageCount = Reflect.get(version.metadata, "pageCount")
      const maxPages = typeof pageCount === "number" ? pageCount : null
      if (maxPages !== null && input.page > maxPages) {
        throw new Error(`Page ${input.page} exceeds document page count ${maxPages}`)
      }

      const id = input.id ?? evidenceAnchorIdSchema.parse(randomUUID())
      const anchor = evidenceAnchorSchema.parse({
        id,
        documentVersionId: input.documentVersionId,
        page: input.page,
        quote: input.quote,
        x: input.x ?? 0,
        y: input.y ?? 0,
        fragments: input.fragments ?? [],
        astRanges: input.astRanges,
        createdAt: new Date().toISOString(),
      })

      cachedStatement(
        this.db,
        `
      INSERT INTO evidence_anchors (id, document_version_id, page, quote, x, y, fragments_json, ast_ranges_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        anchor.id,
        anchor.documentVersionId,
        anchor.page,
        anchor.quote,
        anchor.x,
        anchor.y,
        JSON.stringify(anchor.fragments),
        anchor.astRanges ? JSON.stringify(anchor.astRanges) : null,
        anchor.createdAt,
      )
      return anchor
    })
  }

  getEvidenceAnchor(id: EvidenceAnchorId): EvidenceAnchor | null {
    const raw = cachedStatement(this.db, "SELECT * FROM evidence_anchors WHERE id = ?").get(id)
    if (!raw) return null
    return rowToAnchor(anchorRowSchema.parse(raw))
  }

  getEvidenceNavigation(anchorId: EvidenceAnchorId): EvidenceNavigationTarget | null {
    return executeGetEvidenceNavigation(this.db, anchorId)
  }

  createDocumentVersion(version: DocumentVersionRecord): DocumentVersionRecord {
    return withKnowledgeSavepoint(this.db, () => {
      const parsed = documentVersionRecordSchema.parse(version)
      const existing = this.getDocumentVersion(parsed.id)
      if (existing) {
        throw new Error(`Document version ${parsed.id} already exists and is immutable`)
      }

      cachedStatement(
        this.db,
        `
      INSERT INTO document_versions (id, original_document_id, paper_node_id, hash, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        parsed.id,
        parsed.originalDocumentId,
        parsed.paperNodeId,
        parsed.hash,
        JSON.stringify(parsed.metadata),
        parsed.createdAt,
      )
      return parsed
    })
  }

  getDocumentVersion(id: DocumentVersionId): DocumentVersionRecord | null {
    const raw = cachedStatement(this.db, "SELECT * FROM document_versions WHERE id = ?").get(id)
    if (!raw) return null
    return rowToDocVersion(docVersionRowSchema.parse(raw))
  }

  findDocumentVersionsByHash(hash: string): readonly DocumentVersionRecord[] {
    const rawRows = cachedStatement(this.db, "SELECT * FROM document_versions WHERE hash = ?").all(
      hash,
    )
    return rawRows.map((r) => rowToDocVersion(docVersionRowSchema.parse(r)))
  }

  findDocumentVersionsByDocId(documentId: string): readonly DocumentVersionRecord[] {
    const rawRows = cachedStatement(
      this.db,
      "SELECT * FROM document_versions WHERE original_document_id = ?",
    ).all(documentId)
    return rawRows.map((r) => rowToDocVersion(docVersionRowSchema.parse(r)))
  }

  /** Removes a deleted document's versions; their evidence anchors cascade with them. */
  deleteDocumentVersionsForDocument(documentId: string): readonly DocumentVersionRecord[] {
    return withKnowledgeSavepoint(this.db, () => {
      const versions = this.findDocumentVersionsByDocId(documentId)
      cachedStatement(this.db, "DELETE FROM document_versions WHERE original_document_id = ?").run(
        documentId,
      )
      return versions
    })
  }
}
