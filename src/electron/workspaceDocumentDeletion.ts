import type { DatabaseSync } from "node:sqlite"
import type { DocumentId, DocumentRecord, Workspace } from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { syncWorkspaceToRepository } from "./knowledgeWorkspaceSync"

/**
 * Removes one document in a single transaction: its board placements, insights and
 * active selection through the regular workspace sync, then its versions (evidence
 * anchors cascade) and paper node. Card note nodes stay as knowledge, unplaced.
 */
export function removeDocumentFromRepository(
  repository: KnowledgeRepository,
  db: DatabaseSync,
  current: Workspace,
  id: DocumentId,
): DocumentRecord | null {
  const document = current.documents.find((candidate) => candidate.id === id)
  if (!document) return null
  const documents = current.documents.filter((candidate) => candidate.id !== id)
  const next: Workspace = {
    ...current,
    documents,
    cards: current.cards.filter((card) => card.documentId !== id),
    insights: current.insights.filter((insight) => insight.documentId !== id),
    activeDocumentId:
      current.activeDocumentId === id ? (documents[0]?.id ?? null) : current.activeDocumentId,
  }
  db.exec("BEGIN IMMEDIATE")
  try {
    syncWorkspaceToRepository(repository, db, next, undefined, true, current)
    const versions = repository.deleteDocumentVersionsForDocument(id)
    for (const paperNodeId of new Set(versions.map((version) => version.paperNodeId))) {
      repository.deleteNode(paperNodeId)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return document
}
