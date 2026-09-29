// @vitest-environment node
import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { closeKnowledgeDatabase, openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../src/electron/knowledgeRepository"
import { rowToNode } from "../../src/electron/knowledgeRepositoryRows"
import {
  projectRepositoryToWorkspace,
  WorkspaceProjector,
} from "../../src/electron/knowledgeWorkspaceProjection"
import { syncWorkspaceToRepository } from "../../src/electron/knowledgeWorkspaceSync"
import { defaultWorkspace } from "../../src/electron/workspaceStore"
import {
  type BoardCard,
  boardCardSchema,
  type DocumentRecord,
  documentIdSchema,
  documentRecordSchema,
  sourceAnchorSchema,
} from "../../src/shared/schemas"

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const db of databases.splice(0)) closeKnowledgeDatabase(db)
})

/** The projection as it was computed before it became one joined, memoized query. */
function referenceProjection(repo: KnowledgeRepository, db: DatabaseSync) {
  const metaSchema = boardCardSchema
    .pick({ chat: true, loading: true, sourceKey: true, sourceUrl: true, sourceMeta: true })
    .partial()
    .extend({
      documentId: documentIdSchema.optional(),
      cardKind: boardCardSchema.shape.kind.optional(),
      anchor: sourceAnchorSchema.optional(),
    })
  const cards: BoardCard[] = []
  for (const placement of repo.findPlacementsForBoard(repo.getOrCreateDefaultBoard().id)) {
    const node = repo.getNode(placement.nodeId)
    const parsed = node ? metaSchema.safeParse(node.metadata) : null
    const meta = parsed?.success ? parsed.data : {}
    if (!node || !meta.documentId || !meta.anchor) continue
    cards.push(
      boardCardSchema.parse({
        id: placement.cardId ?? placement.id,
        documentId: meta.documentId,
        kind: meta.cardKind ?? "note",
        title: node.title,
        body: node.body,
        x: placement.x,
        y: placement.y,
        minimized: placement.minimized,
        width: placement.width,
        height: placement.height,
        loading: Boolean(meta.loading),
        chat: meta.chat ?? [],
        sourceKey: meta.sourceKey,
        sourceUrl: meta.sourceUrl,
        sourceMeta: meta.sourceMeta,
        anchor: meta.anchor,
      }),
    )
  }
  const papers = db
    .prepare("SELECT * FROM knowledge_nodes WHERE kind = 'paper'")
    .all()
    .map((row) => rowToNode(row))
    .sort(
      (left, right) =>
        (left.updatedAt < right.updatedAt ? 1 : -1) * Number(left.updatedAt !== right.updatedAt),
    )
  const documents = papers.flatMap((paper) => {
    const record = documentRecordSchema.safeParse(Reflect.get(paper.metadata, "documentRecord"))
    return record.success
      ? [documentRecordSchema.parse({ ...record.data, title: paper.title, overview: paper.body })]
      : []
  })
  return { cards, documents }
}

function paper(index: number): DocumentRecord {
  return documentRecordSchema.parse({
    id: (index + 1).toString(16).padStart(16, "0"),
    name: `paper-${index}.pdf`,
    hash: (index + 1).toString(16).padStart(64, "0"),
    bytes: 100 + index,
    importedAt: "2026-09-01T00:00:00.000Z",
    pageCount: 9,
    title: `Paper ${index}`,
    authors: [],
    year: null,
    doi: null,
    overview: `Overview ${index}`,
    quality: { textCharacters: 1, needsOcr: false, warnings: [] },
    ...(index % 2 === 0 ? { lastReadPage: 3 } : {}),
  })
}

function card(index: number, document: DocumentRecord): BoardCard {
  return boardCardSchema.parse({
    id: randomUUID(),
    documentId: document.id,
    kind: index % 4 === 0 ? "sticky" : "note",
    title: `Card ${index}`,
    body: `Body ${index}`,
    x: index,
    y: index * 2,
    minimized: index % 5 === 0,
    anchor: { page: 1 + (index % 9), quote: `Quote ${index}`, x: 1, y: 2, fragments: [] },
  })
}

function seededRepository(): { repo: KnowledgeRepository; db: DatabaseSync } {
  const db = openKnowledgeDatabase(":memory:")
  databases.push(db)
  const repo = new KnowledgeRepository(db)
  const documents = Array.from({ length: 30 }, (_, index) => paper(index))
  const cards = Array.from({ length: 60 }, (_, index) =>
    card(index, documents[index % 30] ?? paper(0)),
  )
  syncWorkspaceToRepository(repo, db, { ...defaultWorkspace(), documents, cards })
  // Equal timestamps and z-indexes make the tie order observable.
  db.exec("UPDATE knowledge_nodes SET updated_at = '2026-09-02T00:00:00.000Z' WHERE rowid % 3 = 0")
  db.exec("UPDATE placements SET z_index = rowid % 4")
  const stray = repo.createNode({
    kind: "note",
    title: "No anchor",
    metadata: { cardKind: "note" },
  })
  repo.createPlacement({ boardId: repo.getOrCreateDefaultBoard().id, nodeId: stray.id, x: 0, y: 0 })
  repo.createNode({ kind: "paper", title: "Scholarly", metadata: { documentRecord: { id: "x" } } })
  return { repo, db }
}

describe("workspace projection", () => {
  it("projects the same cards and documents, in the same order, as the per-placement lookups", () => {
    const { repo, db } = seededRepository()
    const projected = projectRepositoryToWorkspace(repo, db)
    const reference = referenceProjection(repo, db)

    expect(projected.cards).toHaveLength(60)
    expect(projected.cards).toEqual(reference.cards)
    expect(projected.documents).toHaveLength(30)
    expect(projected.documents).toEqual(reference.documents)
    expect(new WorkspaceProjector(repo).project()).toEqual(projected)
  })

  it("reuses the frozen objects of unchanged rows and re-reads changed ones", () => {
    const { repo, db } = seededRepository()
    const projector = new WorkspaceProjector(repo)
    const before = projector.project()
    const changed = before.cards[7]
    if (!changed) throw new Error("Expected a card")
    const placement = repo
      .findPlacementsForBoard(repo.getOrCreateDefaultBoard().id)
      .find((candidate) => candidate.cardId === changed.id)
    if (!placement) throw new Error("Expected a placement")
    repo.updateNode({ id: placement.nodeId, title: "Renamed card" })

    const after = projector.project()
    expect(after.cards[7]?.title).toBe("Renamed card")
    expect(after.cards.filter((item, index) => item === before.cards[index])).toHaveLength(59)
    expect(after.documents.every((item, index) => item === before.documents[index])).toBe(true)
    expect(Object.isFrozen(after.cards[0]?.anchor)).toBe(true)
    expect(after).toEqual(projectRepositoryToWorkspace(repo, db))
  })
})
