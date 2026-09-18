import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseMarkdownNode, serializeMarkdownNode } from "../../src/electron/interchangeMarkdown"
import { InterchangeService } from "../../src/electron/interchangeService"
import { openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../src/electron/knowledgeRepository"
import { experimentRecordV1Schema } from "../../src/shared/interchangeSchemas"
import {
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  type KnowledgeNode,
  type KnowledgeRelation,
  knowledgeNodeIdSchema,
  knowledgeRelationIdSchema,
  placementIdSchema,
} from "../../src/shared/knowledgeSchemas"
import { documentIdSchema, sha256Schema } from "../../src/shared/schemas"

describe("InterchangeService Integration", () => {
  let db: DatabaseSync
  let repo: KnowledgeRepository
  let service: InterchangeService

  beforeEach(() => {
    db = openKnowledgeDatabase(":memory:")
    repo = new KnowledgeRepository(db)
    service = new InterchangeService(repo)
  })

  afterEach(() => {
    db.close()
  })

  it("exports and imports markdown notes with roundtrip fidelity", async () => {
    const node = repo.createNode({
      kind: "concept",
      title: "Active Inference",
      body: "A framework in theoretical neurobiology.",
      aliases: ["FEP"],
      metadata: { field: "neuroscience" },
    })

    const md = service.exportNodeToMarkdown(node.id)
    expect(md).toContain("Active Inference")

    const preview = service.previewMarkdownImport([md])
    expect(preview.isValid).toBe(true)
    expect(preview.conflicts).toHaveLength(1)
    expect(preview.conflicts[0]?.nodeId).toBe(node.id)

    // Simulate new node import
    const newNodeId = knowledgeNodeIdSchema.parse("a1234567-89ab-4cde-8012-3456789abcde")
    const newMd = md
      .replace(node.id, newNodeId)
      .replace("Active Inference", "Free Energy Principle")
    const newPreview = service.previewMarkdownImport([newMd])
    expect(newPreview.newNodes).toHaveLength(1)

    const commitResult = await service.commitMarkdownImport(newPreview.newNodes)
    expect(commitResult.createdNodes).toHaveLength(1)
    expect(commitResult.createdNodes[0]?.title).toBe("Free Energy Principle")
  })

  it("exports board canvas and imports it to a new board", () => {
    const board = repo.getOrCreateDefaultBoard()
    const node = repo.createNode({
      kind: "claim",
      title: "Bounded Rationality",
      body: "Decision-making is limited by available information and cognitive resources.",
    })
    repo.createPlacement({
      boardId: board.id,
      nodeId: node.id,
      x: 150,
      y: 200,
      width: 320,
      height: 180,
    })

    const exportResult = service.exportBoardCanvas(board.id)
    expect(exportResult.canvas.nodes).toHaveLength(1)
    expect(exportResult.sidecar.nodes).toHaveLength(1)

    const targetBoard = repo.createBoard("Target Board")
    const preview = service.previewCanvasImport(
      JSON.stringify(exportResult.canvas),
      JSON.stringify(exportResult.sidecar),
    )
    expect(preview.isValid).toBe(true)

    const placed = service.commitCanvasImport(preview, targetBoard.id)
    expect(placed).toHaveLength(1)
    expect(placed[0]?.boardId).toBe(targetBoard.id)
    expect(placed[0]?.nodeId).toBe(node.id)
    expect(placed[0]?.x).toBe(150)
  })

  it("handles zotero commit and dedup through the application service", () => {
    const zoteroItems = [
      {
        key: "VASW2017",
        version: 1,
        itemType: "journalArticle",
        title: "Attention Is All You Need",
        creators: [{ creatorType: "author", firstName: "Ashish", lastName: "Vaswani" }],
        abstractNote: "Transformer architecture",
        date: "2017",
        DOI: "10.48550/arXiv.1706.03762",
        tags: [],
        collections: [],
        relations: {},
      },
    ]

    const preview = service.previewZoteroFileImport(JSON.stringify(zoteroItems))
    expect(preview.items).toHaveLength(1)

    const commitRes = service.commitZoteroImport(preview.items)
    expect(commitRes.createdNodeIds).toHaveLength(1)

    const existingMap = repo.getExternalMapping("zotero", "default:VASW2017")
    expect(existingMap).not.toBeNull()
    const existingList = existingMap ? [existingMap] : []

    // Repeat commit with same items
    const secondPreview = service.previewZoteroFileImport(JSON.stringify(zoteroItems), existingList)
    const secondCommit = service.commitZoteroImport(secondPreview.items)
    expect(secondCommit.createdNodeIds).toHaveLength(0)
    expect(secondCommit.skippedItemKeys).toContain("VASW2017")
  })

  it("roundtrips stable node, evidence, version, relation, and provenance IDs", async () => {
    const paper = repo.createNode({
      id: knowledgeNodeIdSchema.parse("11111111-1111-4111-8111-111111111111"),
      kind: "paper",
      title: "Source Paper",
    })
    const concept = repo.createNode({
      id: knowledgeNodeIdSchema.parse("22222222-2222-4222-8222-222222222222"),
      kind: "concept",
      title: "Stable concept",
      body: "A source-linked concept.",
    })
    const version = repo.createDocumentVersion({
      id: documentVersionIdSchema.parse("33333333-3333-4333-8333-333333333333"),
      originalDocumentId: documentIdSchema.parse("abcdefabcdefabcd"),
      paperNodeId: paper.id,
      hash: sha256Schema.parse("a".repeat(64)),
      metadata: { pageCount: 4 },
      createdAt: "2026-09-05T00:00:00.000Z",
    })
    const anchor = repo.createEvidenceAnchor({
      id: evidenceAnchorIdSchema.parse("44444444-4444-4444-8444-444444444444"),
      documentVersionId: version.id,
      page: 2,
      quote: "A source quote",
      x: 12,
      y: 18,
      fragments: [{ x: 12, y: 18, width: 120, height: 20 }],
    })
    const relation = repo.createRelation({
      id: knowledgeRelationIdSchema.parse("55555555-5555-4555-8555-555555555555"),
      sourceId: concept.id,
      targetId: paper.id,
      predicate: "supported_by",
      provenance: { source: "import", model: "fixture-model", extractorVersion: "fixture-1" },
      evidenceIds: [anchor.id],
      reviewState: "accepted",
    })

    const markdown = service.exportNodeToMarkdown(concept.id)
    const targetDb = openKnowledgeDatabase(":memory:")
    try {
      const targetRepo = new KnowledgeRepository(targetDb)
      const targetService = new InterchangeService(targetRepo)
      targetRepo.createNode({ id: paper.id, kind: "paper", title: paper.title })
      const preview = targetService.previewMarkdownImport([markdown])
      expect(preview.isValid).toBe(true)
      await targetService.commitMarkdownImport(preview.newNodes)

      expect(targetRepo.getNode(concept.id)?.id).toBe(concept.id)
      expect(targetRepo.getDocumentVersion(version.id)?.hash).toBe(version.hash)
      expect(targetRepo.getEvidenceAnchor(anchor.id)?.fragments).toEqual(anchor.fragments)
      const importedRelation = targetRepo.getRelation(relation.id)
      expect(importedRelation?.evidenceIds).toEqual([anchor.id])
      expect(importedRelation?.provenance).toEqual(relation.provenance)
    } finally {
      targetDb.close()
    }
  })

  it("rolls back all Markdown writes when a later relation ID fails", async () => {
    const nodeA: KnowledgeNode = {
      id: knowledgeNodeIdSchema.parse("66666666-6666-4666-8666-666666666666"),
      kind: "concept",
      title: "Rollback A",
      body: "A",
      aliases: [],
      metadata: {},
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    }
    const nodeB = {
      ...nodeA,
      id: knowledgeNodeIdSchema.parse("77777777-7777-4777-8777-777777777777"),
      title: "Rollback B",
      body: "B",
    }
    const relationId = knowledgeRelationIdSchema.parse("88888888-8888-4888-8888-888888888888")
    const relationA: KnowledgeRelation = {
      id: relationId,
      sourceId: nodeA.id,
      targetId: nodeB.id,
      predicate: "relates_to",
      provenance: { source: "import", model: null, extractorVersion: "fixture-1" },
      evidenceIds: [],
      reviewState: "accepted",
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    }
    const relationB = { ...relationA, sourceId: nodeB.id, targetId: nodeA.id }

    const first = parseMarkdownNode(serializeMarkdownNode(nodeA, [], [relationA]))
    const second = parseMarkdownNode(serializeMarkdownNode(nodeB, [], [relationB]))

    await expect(service.commitMarkdownImport([first, second])).rejects.toThrow()
    expect(repo.getNode(nodeA.id)).toBeNull()
    expect(repo.getNode(nodeB.id)).toBeNull()
    expect(repo.getRelation(relationId)).toBeNull()
  })

  it("revalidates a Markdown conflict after preview", async () => {
    const nodeId = knowledgeNodeIdSchema.parse("99999999-9999-4999-8999-999999999999")
    const markdown = serializeMarkdownNode(
      {
        id: nodeId,
        kind: "note",
        title: "Previewed note",
        body: "Original body",
        aliases: [],
        metadata: {},
        createdAt: "2026-09-05T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      },
      [],
      [],
    )
    const preview = service.previewMarkdownImport([markdown])
    repo.createNode({ id: nodeId, kind: "note", title: "Intervening note", body: "Changed" })

    await expect(service.commitMarkdownImport(preview.newNodes)).rejects.toThrow(
      "Conflict detected",
    )
    expect(repo.getNode(nodeId)?.body).toBe("Changed")
  })

  it("exports every placement beyond the repository query default", () => {
    const board = repo.getOrCreateDefaultBoard()
    for (let index = 0; index < 76; index += 1) {
      const suffix = String(index).padStart(12, "0")
      const nodeId = knowledgeNodeIdSchema.parse(`aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`)
      const placementId = placementIdSchema.parse(`bbbbbbbb-bbbb-4bbb-8bbb-${suffix}`)
      const node = repo.createNode({ id: nodeId, kind: "note", title: `Node ${index}` })
      repo.createPlacement({
        id: placementId,
        boardId: board.id,
        nodeId: node.id,
        x: index * 10,
        y: 0,
      })
    }

    const exported = service.exportBoardCanvas(board.id)

    expect(exported.canvas.nodes).toHaveLength(76)
    expect(exported.sidecar.nodes).toHaveLength(76)
  })

  it("commits an experiment run with an explicit hypothesis relation and board placement", () => {
    const hypothesis = repo.createNode({ kind: "hypothesis", title: "Testable hypothesis" })
    const board = repo.getOrCreateDefaultBoard()
    const record = experimentRecordV1Schema.parse({
      format: "scourgify-experiment-v1",
      runId: "run-explicit-001",
      title: "Synthetic run",
      status: "completed",
      task: "fixture-task",
      model: "fixture-model",
      codeCommit: null,
      aggregateConfig: { limit: 10 },
      aggregateMetrics: { accuracy: 0.9 },
      failureCategories: [],
      startedAt: null,
      completedAt: null,
    })

    const result = service.commitExperimentImport([record], {
      hypothesisNodeId: hypothesis.id,
      targetBoardId: board.id,
    })

    expect(result.mappedRunIds).toEqual([record.runId])
    expect(result.createdRelations[0]?.predicate).toBe("tests")
    expect(result.createdPlacements[0]?.boardId).toBe(board.id)
    expect(repo.getExternalMapping("experiment", record.runId)).not.toBeNull()
  })
})
