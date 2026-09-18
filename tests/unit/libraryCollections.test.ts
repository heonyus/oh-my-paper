import { describe, expect, it } from "vitest"
import { loadLibraryCollections } from "../../src/renderer/components/library-collections"
import type { KnowledgeClientOps } from "../../src/renderer/lib/knowledgeTypes"
import {
  boardRecordSchema,
  documentVersionRecordSchema,
  knowledgeNodeIdSchema,
  placementRecordSchema,
} from "../../src/shared/knowledgeSchemas"
import { documentRecordSchema } from "../../src/shared/schemas"

const document = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-30T00:00:00.000Z",
  pageCount: 4,
  title: "Paper",
  authors: [],
  year: 2026,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 20, needsOcr: false, warnings: [] },
})
const paperNodeId = knowledgeNodeIdSchema.parse("11111111-1111-4111-8111-111111111111")
const board = boardRecordSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  title: "AKI review",
  description: "",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
})
const secondBoard = boardRecordSchema.parse({
  id: "55555555-5555-4555-8555-555555555555",
  title: "Other review",
  description: "",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
})
const placement = placementRecordSchema.parse({
  id: "33333333-3333-4333-8333-333333333333",
  boardId: board.id,
  nodeId: paperNodeId,
  x: 80,
  y: 80,
  width: 320,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
})
const version = documentVersionRecordSchema.parse({
  id: "44444444-4444-4444-8444-444444444444",
  originalDocumentId: document.id,
  paperNodeId,
  hash: document.hash,
  metadata: {},
  createdAt: "2026-08-30T00:00:00.000Z",
})

const emptyOps = {
  findNodes: async () => [],
  getNode: async () => null,
  createNode: async () => {
    throw new Error("unused")
  },
  updateNode: async () => {
    throw new Error("unused")
  },
  deleteNode: async () => false,
  findRelations: async () => [],
  createRelation: async () => {
    throw new Error("unused")
  },
  updateRelation: async () => {
    throw new Error("unused")
  },
  getBacklinks: async () => [],
  getNeighbourGraph: async () => {
    throw new Error("unused")
  },
  getEvidenceNavigation: async () => null,
  getEvidenceAnchor: async () => null,
  getDocVersionsByHash: async () => [],
  getOrCreateDefaultBoard: async () => board,
  listBoards: async () => [],
  createBoard: async () => board,
  findPlacementsForBoard: async () => [],
  createPlacement: async () => placement,
  updatePlacement: async () => placement,
  deletePlacement: async () => false,
} satisfies KnowledgeClientOps

describe("library collection mapping", () => {
  it("maps persisted project placements to local documents by immutable PDF version hash", async () => {
    const ops: KnowledgeClientOps = {
      ...emptyOps,
      getDocVersionsByHash: async (hash) => (hash === document.hash ? [version] : []),
      listBoards: async () => [board],
      findPlacementsForBoard: async () => [placement],
    }
    const collections = await loadLibraryCollections(ops, [document])

    expect(collections).toHaveLength(1)
    expect(collections[0]?.board.title).toBe("AKI review")
    expect(collections[0]?.members[0]?.documentId).toBe(document.id)
  })

  it("retains usable boards when one document version lookup fails", async () => {
    const ops: KnowledgeClientOps = {
      ...emptyOps,
      getDocVersionsByHash: async () => {
        throw new Error("transient lookup failure")
      },
      listBoards: async () => [board],
      findPlacementsForBoard: async () => [],
    }
    const collections = await loadLibraryCollections(ops, [document])

    expect(collections[0]?.board.id).toBe(board.id)
    expect(collections[0]?.lookupFailures).toEqual([document.id])
  })

  it("retains other boards when one placement lookup fails", async () => {
    const ops: KnowledgeClientOps = {
      ...emptyOps,
      getDocVersionsByHash: async (hash) => (hash === document.hash ? [version] : []),
      listBoards: async () => [board, secondBoard],
      findPlacementsForBoard: async (boardId) => {
        if (boardId === board.id) throw new Error("transient placement failure")
        return []
      },
    }
    const collections = await loadLibraryCollections(ops, [document])

    expect(collections).toHaveLength(2)
    expect(collections[0]?.placementLoadFailed).toBe(true)
    expect(collections[1]?.placementLoadFailed).toBe(false)
  })
})
