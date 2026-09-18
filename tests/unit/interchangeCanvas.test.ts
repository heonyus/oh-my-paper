import { describe, expect, it } from "vitest"
import { exportBoardToJsonCanvas } from "../../src/electron/interchangeCanvasExport"
import {
  buildCanvasImportPlacements,
  parseCanvasSidecar,
  parseJsonCanvas,
  previewCanvasImport,
} from "../../src/electron/interchangeCanvasImport"
import {
  type BoardId,
  boardIdSchema,
  type KnowledgeNode,
  type KnowledgeRelation,
  knowledgeNodeIdSchema,
  knowledgeRelationIdSchema,
  type PlacementRecord,
  placementIdSchema,
} from "../../src/shared/knowledgeSchemas"

describe("JSON Canvas v1.0 and Sidecar Adapter", () => {
  const boardId: BoardId = boardIdSchema.parse("a1111111-1111-4111-8111-111111111111")
  const node1Id = knowledgeNodeIdSchema.parse("b2222222-2222-4222-8222-222222222222")
  const node2Id = knowledgeNodeIdSchema.parse("c3333333-3333-4333-8333-333333333333")

  const node1: KnowledgeNode = {
    id: node1Id,
    kind: "concept",
    title: "Working Memory",
    body: "Short term memory buffer located at /Users/reader/secret/file.txt",
    aliases: ["WM"],
    metadata: {},
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  const node2: KnowledgeNode = {
    id: node2Id,
    kind: "hypothesis",
    title: "Capacity Limits",
    body: "Limits bounded around 4 items",
    aliases: [],
    metadata: {},
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  const p1: PlacementRecord = {
    id: placementIdSchema.parse("d4444444-4444-4444-8444-444444444444"),
    boardId,
    nodeId: node1Id,
    cardId: null,
    x: 100,
    y: 150,
    width: 300,
    height: 200,
    minimized: false,
    zIndex: 1,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  const p2: PlacementRecord = {
    id: placementIdSchema.parse("e5555555-5555-4555-8555-555555555555"),
    boardId,
    nodeId: node2Id,
    cardId: null,
    x: 500,
    y: 150,
    width: 300,
    height: 250,
    minimized: false,
    zIndex: 2,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  const rel: KnowledgeRelation = {
    id: knowledgeRelationIdSchema.parse("f6666666-6666-4666-8666-666666666666"),
    sourceId: node1Id,
    targetId: node2Id,
    predicate: "supported_by",
    provenance: { source: "user", model: null, extractorVersion: null },
    evidenceIds: [],
    reviewState: "accepted",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  it("exports valid JSON Canvas v1.0 and Scourgify sidecar metadata", () => {
    const result = exportBoardToJsonCanvas(boardId, [p1, p2], [node1, node2], [rel], [])
    expect(result.canvas.nodes).toHaveLength(2)
    expect(result.canvas.edges).toHaveLength(1)
    expect(result.canvas.edges[0]?.fromNode).toBe(p1.id)
    expect(result.canvas.edges[0]?.toNode).toBe(p2.id)
    expect(result.canvas.edges[0]?.label).toContain("supported_by")

    // Sanitization check: ensure local filesystem path was redacted
    expect(result.canvas.nodes[0]?.text).not.toContain("/Users/reader")
    expect(result.canvas.nodes[0]?.text).toContain("[redacted-path]")

    // Sidecar check
    expect(result.sidecar.format).toBe("scourgify-canvas-sidecar-v1")
    expect(result.sidecar.boardId).toBe(boardId)
    expect(result.sidecar.nodes).toHaveLength(2)
    expect(result.sidecar.relations).toHaveLength(1)
  })

  it("parses valid JSON canvas and sidecar, previewing missing nodes correctly", () => {
    const exported = exportBoardToJsonCanvas(boardId, [p1, p2], [node1, node2], [rel], [])
    const canvasRaw = JSON.stringify(exported.canvas)
    const sidecarRaw = JSON.stringify(exported.sidecar)

    const parsedCanvas = parseJsonCanvas(canvasRaw)
    const parsedSidecar = parseCanvasSidecar(sidecarRaw)

    // Preview when both nodes exist in workspace
    const previewAll = previewCanvasImport(parsedCanvas, parsedSidecar, [node1, node2])
    expect(previewAll.isValid).toBe(true)
    expect(previewAll.nodesToPlace).toHaveLength(2)
    expect(previewAll.missingNodes).toHaveLength(0)

    // Preview when node2 is missing in workspace
    const previewMissing = previewCanvasImport(parsedCanvas, parsedSidecar, [node1])
    expect(previewMissing.isValid).toBe(false)
    expect(previewMissing.missingNodes).toContain(node2Id)
  })

  it("builds placement inputs accurately", () => {
    const exported = exportBoardToJsonCanvas(boardId, [p1, p2], [node1, node2], [rel], [])
    const preview = previewCanvasImport(exported.canvas, exported.sidecar, [node1, node2])
    const newBoardId = boardIdSchema.parse("a9999999-9999-4999-8999-999999999999")
    const placements = buildCanvasImportPlacements(preview, newBoardId)

    expect(placements).toHaveLength(2)
    expect(placements[0]?.boardId).toBe(newBoardId)
    expect(placements[0]?.nodeId).toBe(node1Id)
    expect(placements[0]?.x).toBe(p1.x)
    expect(placements[0]?.y).toBe(p1.y)
  })

  it("rejects malformed canvas json", () => {
    expect(() => parseJsonCanvas("invalid json")).toThrow("Invalid JSON Canvas")
    expect(() => parseJsonCanvas(JSON.stringify({ nodes: "not-array" }))).toThrow(
      "Invalid JSON Canvas structure",
    )
  })
})
