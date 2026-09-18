import { canvasSidecarMetadataSchema, jsonCanvasV1Schema } from "../shared/interchangeSchemas"
import type {
  CanvasImportPreview,
  CanvasSidecarMetadata,
  JsonCanvasV1,
} from "../shared/interchangeTypes"
import { type BoardId, boardIdSchema } from "../shared/knowledgeSchemas"
import type { CreatePlacementInput, KnowledgeNode, KnowledgeNodeId } from "../shared/knowledgeTypes"

export function parseJsonCanvas(rawContent: string): JsonCanvasV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (err) {
    throw new Error(`Invalid JSON Canvas: ${String(err)}`)
  }
  const result = jsonCanvasV1Schema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid JSON Canvas structure: ${result.error.message}`)
  }
  return result.data
}

export function parseCanvasSidecar(rawContent: string): CanvasSidecarMetadata {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (err) {
    throw new Error(`Invalid Canvas sidecar metadata: ${String(err)}`)
  }
  const result = canvasSidecarMetadataSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid Canvas sidecar structure: ${result.error.message}`)
  }
  return result.data
}

export function previewCanvasImport(
  canvas: JsonCanvasV1,
  sidecar: CanvasSidecarMetadata,
  existingNodes: readonly KnowledgeNode[] | ((id: KnowledgeNodeId) => KnowledgeNode | null),
): CanvasImportPreview {
  const isFunction = typeof existingNodes === "function"
  const existingMap = new Map<string, KnowledgeNode>()
  if (!isFunction) {
    for (const n of existingNodes) {
      existingMap.set(n.id, n)
    }
  }

  const getNode = (id: KnowledgeNodeId): KnowledgeNode | null => {
    if (isFunction) return existingNodes(id)
    return existingMap.get(id) ?? null
  }

  const canvasNodeMap = new Map<string, (typeof canvas.nodes)[number]>()
  for (const cn of canvas.nodes) {
    canvasNodeMap.set(cn.id, cn)
  }

  const nodesToPlace: {
    nodeId: KnowledgeNodeId
    title: string
    x: number
    y: number
    width: number
    height: number | null
  }[] = []
  const missingNodes: string[] = []

  for (const sn of sidecar.nodes) {
    const existing = getNode(sn.nodeId)
    if (!existing) {
      missingNodes.push(sn.nodeId)
      continue
    }

    const cn = canvasNodeMap.get(sn.placement.id)
    const x = cn ? cn.x : sn.placement.x
    const y = cn ? cn.y : sn.placement.y
    const width = cn ? cn.width : sn.placement.width
    const height = cn ? cn.height : sn.placement.height

    nodesToPlace.push({
      nodeId: sn.nodeId,
      title: sn.title,
      x,
      y,
      width,
      height,
    })
  }

  const isValid = missingNodes.length === 0

  return {
    boardId: sidecar.boardId,
    nodesToPlace,
    relations: sidecar.relations,
    missingNodes,
    isValid,
  }
}

export function buildCanvasImportPlacements(
  preview: CanvasImportPreview,
  targetBoardId: BoardId | string,
): readonly CreatePlacementInput[] {
  const validBoardId = boardIdSchema.parse(targetBoardId)
  return preview.nodesToPlace.map((item) => ({
    boardId: validBoardId,
    nodeId: item.nodeId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  }))
}
