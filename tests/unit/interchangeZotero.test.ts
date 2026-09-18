import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseZoteroExportJson, previewZoteroImport } from "../../src/electron/interchangeZotero"
import { commitZoteroItems } from "../../src/electron/interchangeZoteroCommit"
import { fetchLocalZoteroItems, validateZoteroUrl } from "../../src/electron/interchangeZoteroFetch"
import { openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../src/electron/knowledgeRepository"
import {
  type ExternalMapping,
  externalMappingIdSchema,
  knowledgeNodeIdSchema,
} from "../../src/shared/knowledgeSchemas"

describe("Zotero Interchange Adapter", () => {
  let db: DatabaseSync
  let repo: KnowledgeRepository

  beforeEach(() => {
    db = openKnowledgeDatabase(":memory:")
    repo = new KnowledgeRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  const sampleZoteroItem1 = {
    key: "ITEM001",
    version: 1,
    itemType: "journalArticle",
    title: "Attention Is All You Need",
    creators: [
      { creatorType: "author", firstName: "Ashish", lastName: "Vaswani" },
      { creatorType: "author", firstName: "Noam", lastName: "Shazeer" },
    ],
    abstractNote:
      "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
    date: "2017",
    DOI: "10.48550/arXiv.1706.03762",
    tags: [],
    collections: [],
    relations: {},
  }

  const sampleZoteroItem2 = {
    key: "ITEM002",
    version: 1,
    itemType: "book",
    title: "Deep Learning",
    creators: [{ creatorType: "author", name: "Ian Goodfellow" }],
    abstractNote: "An MIT Press textbook on deep learning.",
    date: "2016",
    tags: [],
    collections: [],
    relations: {},
  }

  it("parses valid Zotero JSON export items", () => {
    const raw = JSON.stringify([sampleZoteroItem1, sampleZoteroItem2])
    const items = parseZoteroExportJson(raw)
    expect(items).toHaveLength(2)
    expect(items[0]?.key).toBe("ITEM001")
    expect(items[1]?.title).toBe("Deep Learning")
  })

  it("previews Zotero imports detecting existing external ID mappings and DOI matches", () => {
    const existingNodeId = knowledgeNodeIdSchema.parse("a1111111-1111-4111-8111-111111111111")
    const existingMapping: ExternalMapping = {
      id: externalMappingIdSchema.parse("b2222222-2222-4222-8222-222222222222"),
      nodeId: existingNodeId,
      system: "zotero",
      externalId: "default:ITEM001",
      isFullTextReviewed: false,
      metadata: { doi: "10.48550/arXiv.1706.03762" },
      createdAt: "2026-09-05T00:00:00.000Z",
    }

    const preview = previewZoteroImport(
      [sampleZoteroItem1, sampleZoteroItem2],
      [existingMapping],
      [],
    )
    expect(preview.isValid).toBe(true)
    expect(preview.items).toHaveLength(2)
    expect(preview.items[0]?.matchType).toBe("external_id_match")
    expect(preview.items[0]?.existingMapping).toBeDefined()
    expect(preview.items[1]?.matchType).toBe("none")
  })

  it("commits items into repository, creating metadata-only nodes and stable mappings", () => {
    const preview = previewZoteroImport([sampleZoteroItem1, sampleZoteroItem2], [], [])
    const result = commitZoteroItems(repo, preview.items)

    expect(result.createdNodeIds).toHaveLength(2)
    expect(result.mappedExternalIds).toHaveLength(2)
    expect(result.skippedItemKeys).toHaveLength(0)

    const firstId = result.createdNodeIds[0]
    expect(firstId).toBeDefined()
    if (firstId) {
      const firstNode = repo.getNode(firstId)
      expect(firstNode).not.toBeNull()
      expect(firstNode?.title).toBe("Attention Is All You Need")
      expect(firstNode?.kind).toBe("paper")
      expect(Reflect.get(firstNode?.metadata ?? {}, "isFullTextReviewed")).toBe(false)
    }

    const existingMap = repo.getExternalMapping("zotero", "default:ITEM001")
    expect(existingMap).not.toBeNull()
    const mappingsToPass = existingMap ? [existingMap] : []

    // Repeat commit with same items to verify deduplication
    const previewSecond = previewZoteroImport([sampleZoteroItem1], mappingsToPass, repo.findNodes())
    const resultSecond = commitZoteroItems(repo, previewSecond.items)
    expect(resultSecond.createdNodeIds).toHaveLength(0)
    expect(resultSecond.skippedItemKeys).toContain("ITEM001")
  })

  it("enforces SSRF protection on local Zotero API calls", () => {
    expect(() => validateZoteroUrl("http://localhost:23119/api/users/0/items")).not.toThrow()
    expect(() => validateZoteroUrl("https://evil.com/api/users/0/items")).toThrow(
      "Forbidden protocol",
    )
    expect(() => validateZoteroUrl("http://192.168.1.1:23119/api/items")).toThrow("SSRF protection")
    expect(() => validateZoteroUrl("http://localhost:23119/other/path")).toThrow(
      "Forbidden resource path",
    )
    expect(() => validateZoteroUrl("http://localhost:23119/api/users/0/items?limit=1")).toThrow(
      "Query parameters",
    )
  })

  it("fetches local Zotero items via stub transport without real network", async () => {
    const mockResponse = JSON.stringify([{ key: "API001", data: sampleZoteroItem1 }])

    const mockFetch = async () =>
      new Response(mockResponse, {
        status: 200,
        headers: { "Total-Results": "1", "Content-Type": "application/json" },
      })

    const result = await fetchLocalZoteroItems({ customFetch: mockFetch })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.key).toBe("ITEM001")
    expect(result.totalResults).toBe(1)
  })

  it("rejects an oversized streamed response before JSON parsing", async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1)
    const mockFetch = async () => new Response(oversized, { status: 200 })

    await expect(fetchLocalZoteroItems({ customFetch: mockFetch })).rejects.toThrow(
      "maximum size limit",
    )
  })

  it("aborts a body stream that never produces the next chunk", async () => {
    const neverEnding = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
    })
    const mockFetch = async () => new Response(neverEnding, { status: 200 })

    await expect(fetchLocalZoteroItems({ customFetch: mockFetch, timeoutMs: 100 })).rejects.toThrow(
      "timed out",
    )
  })

  it("does not trust a stale caller mapping during idempotent commit", () => {
    const staleMapping: ExternalMapping = {
      id: externalMappingIdSchema.parse("c3333333-3333-4333-8333-333333333333"),
      nodeId: knowledgeNodeIdSchema.parse("d4444444-4444-4444-8444-444444444444"),
      system: "zotero",
      externalId: "default:ITEM001",
      isFullTextReviewed: false,
      metadata: {},
      createdAt: "2026-09-05T00:00:00.000Z",
    }
    const preview = previewZoteroImport([sampleZoteroItem1], [staleMapping], [])

    const result = commitZoteroItems(repo, preview.items, { approvedMergeItemKeys: [] })

    expect(result.createdNodeIds).toHaveLength(1)
    expect(repo.getExternalMapping("zotero", staleMapping.externalId)).not.toBeNull()
  })

  it("rejects duplicate canonical mappings before creating any node", () => {
    const preview = previewZoteroImport([sampleZoteroItem1, sampleZoteroItem1], [], [])

    expect(() => commitZoteroItems(repo, preview.items)).toThrow("Duplicate Zotero mapping")
    expect(repo.findNodes({ kind: "paper", limit: 100 })).toHaveLength(0)
  })
})
