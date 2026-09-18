import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { isDeepStrictEqual } from "node:util"
import { documentVersionIdSchema } from "../shared/knowledgeSchemas"
import type { BoardCard, DocumentInsight, DocumentRecord } from "../shared/schemas"
import { cardIdSchema } from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"

function metadataForCard(card: BoardCard): Readonly<Record<string, unknown>> {
  return {
    cardKind: card.kind,
    documentId: card.documentId,
    chat: card.chat,
    loading: card.loading,
    ...(card.sourceKey === undefined ? {} : { sourceKey: card.sourceKey }),
    ...(card.sourceUrl === undefined ? {} : { sourceUrl: card.sourceUrl }),
    ...(card.sourceMeta === undefined ? {} : { sourceMeta: card.sourceMeta }),
    anchor: card.anchor,
  }
}

function cardNodeChanged(current: BoardCard, incoming: BoardCard): boolean {
  return (
    current.title !== incoming.title ||
    current.body !== incoming.body ||
    !isDeepStrictEqual(metadataForCard(current), metadataForCard(incoming))
  )
}

export function applyDocuments(
  repo: KnowledgeRepository,
  documents: readonly DocumentRecord[],
  currentDocuments: readonly DocumentRecord[],
  now: string,
): void {
  const currentById = new Map(currentDocuments.map((document) => [document.id, document]))
  for (const document of documents) {
    const version = repo.findDocumentVersionsByHash(document.hash)[0]
    if (!version) {
      const paper = repo.createNode({
        kind: "paper",
        title: document.title,
        body: document.overview,
        metadata: { documentRecord: document, pageCount: document.pageCount },
      })
      repo.createDocumentVersion({
        id: documentVersionIdSchema.parse(randomUUID()),
        originalDocumentId: document.id,
        paperNodeId: paper.id,
        hash: document.hash,
        metadata: { name: document.name, bytes: document.bytes, pageCount: document.pageCount },
        createdAt: now,
      })
      continue
    }
    const paper = repo.getNode(version.paperNodeId)
    const currentDocument = currentById.get(document.id)
    if (!paper || !currentDocument || isDeepStrictEqual(currentDocument, document)) continue
    const metadata = { ...paper.metadata, documentRecord: document, pageCount: document.pageCount }
    if (
      paper.title !== document.title ||
      paper.body !== document.overview ||
      !isDeepStrictEqual(paper.metadata, metadata)
    ) {
      repo.updateNode({ id: paper.id, title: document.title, body: document.overview, metadata })
    }
  }
}

export function applyCards(
  repo: KnowledgeRepository,
  cards: readonly BoardCard[],
  currentCards: readonly BoardCard[],
): void {
  const board = repo.getOrCreateDefaultBoard()
  const placements = repo.findPlacementsForBoard(board.id)
  const incomingIds = new Set(cards.map((card) => card.id))
  const currentById = new Map(currentCards.map((card) => [card.id, card]))
  for (const placement of placements) {
    if (!placement.cardId) continue
    const cardId = cardIdSchema.safeParse(placement.cardId)
    if (cardId.success && !incomingIds.has(cardId.data)) repo.deletePlacement(placement.id)
  }

  for (const card of cards) {
    const placement = placements.find((candidate) => candidate.cardId === card.id)
    if (!placement) {
      const node = repo.createNode({
        kind: "note",
        title: card.title,
        body: card.body,
        metadata: metadataForCard(card),
      })
      const version = repo.findDocumentVersionsByDocId(card.documentId)[0]
      if (version && card.kind !== "sticky") {
        const anchor = repo.createEvidenceAnchor({
          documentVersionId: version.id,
          page: card.anchor.page,
          quote: card.anchor.quote,
          x: card.anchor.x,
          y: card.anchor.y,
          fragments: card.anchor.fragments,
          ...(card.anchor.astRanges ? { astRanges: card.anchor.astRanges } : {}),
        })
        repo.createRelation({
          sourceId: version.paperNodeId,
          targetId: node.id,
          predicate: "discusses",
          provenance: { source: "user", model: null, extractorVersion: null },
          evidenceIds: [anchor.id],
          reviewState: "accepted",
        })
      }
      repo.createPlacement({
        boardId: board.id,
        nodeId: node.id,
        cardId: card.id,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        minimized: card.minimized,
      })
      continue
    }

    const node = repo.getNode(placement.nodeId)
    const currentCard = currentById.get(card.id)
    if (!node || !currentCard) continue
    const metadata: Record<string, unknown> = { ...node.metadata }
    for (const key of [
      "cardKind",
      "documentId",
      "chat",
      "loading",
      "sourceKey",
      "sourceUrl",
      "sourceMeta",
      "anchor",
    ]) {
      delete metadata[key]
    }
    Object.assign(metadata, metadataForCard(card))
    if (cardNodeChanged(currentCard, card)) {
      repo.updateNode({ id: node.id, title: card.title, body: card.body, metadata })
    }
    if (
      placement.x !== card.x ||
      placement.y !== card.y ||
      placement.width !== card.width ||
      placement.height !== card.height ||
      placement.minimized !== card.minimized
    ) {
      repo.updatePlacement({
        id: placement.id,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        minimized: card.minimized,
      })
    }
  }
}

export function applyInsights(
  db: DatabaseSync,
  current: readonly DocumentInsight[],
  insights: readonly DocumentInsight[],
): void {
  const key = (insight: DocumentInsight): string => `${insight.documentId}:${insight.kind}`
  const currentByKey = new Map(current.map((insight) => [key(insight), insight]))
  const incomingByKey = new Map(insights.map((insight) => [key(insight), insight]))
  for (const insight of insights) {
    if (isDeepStrictEqual(currentByKey.get(key(insight)), insight)) continue
    db.prepare(`
      INSERT INTO document_insights (document_id, kind, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(document_id, kind) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(insight.documentId, insight.kind, insight.value, insight.updatedAt)
  }
  for (const insight of current) {
    if (!incomingByKey.has(key(insight))) {
      db.prepare("DELETE FROM document_insights WHERE document_id = ? AND kind = ?").run(
        insight.documentId,
        insight.kind,
      )
    }
  }
}
