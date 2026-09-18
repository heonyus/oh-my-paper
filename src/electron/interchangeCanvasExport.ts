import type {
  CanvasEdge,
  CanvasExportResult,
  CanvasNode,
  CanvasSidecarMetadata,
  CanvasSidecarNode,
  JsonCanvasV1,
} from "../shared/interchangeTypes"
import type {
  BoardId,
  EvidenceAnchor,
  KnowledgeNode,
  KnowledgeRelation,
  PlacementRecord,
} from "../shared/knowledgeSchemas"

function sanitizeText(text: string): string {
  // Prevent leaking home directory or absolute filesystem paths
  return text.replace(/\/(Users|home|private|var|tmp)\/[^\s"'`]+/g, "[redacted-path]")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value)
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (isRecord(value)) return sanitizeMetadata(value)
  return value
}

function sanitizeMetadata(meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (/api[_-]?key|secret|password|auth|credential|private[_-]?key/i.test(k)) {
      continue
    }
    result[k] = sanitizeValue(v)
  }
  return result
}

export function exportBoardToJsonCanvas(
  boardId: BoardId,
  placements: readonly PlacementRecord[],
  nodes: readonly KnowledgeNode[],
  relations: readonly KnowledgeRelation[],
  evidenceAnchors: readonly EvidenceAnchor[] = [],
): CanvasExportResult {
  const nodeMap = new Map<string, KnowledgeNode>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  const canvasNodes: CanvasNode[] = []
  const sidecarNodes: CanvasSidecarNode[] = []

  for (const p of placements) {
    const node = nodeMap.get(p.nodeId)
    const title = node ? node.title : "Untitled"
    const body = node ? node.body : ""
    const aliases = node ? node.aliases : []
    const kind = node ? node.kind : "note"
    const metadata = node ? node.metadata : {}

    const text = sanitizeText(`## ${title}\n\n${body}`.trim())
    const height = p.height ?? 200

    canvasNodes.push({
      id: p.id,
      type: "text",
      text,
      x: p.x,
      y: p.y,
      width: p.width,
      height,
    })

    const nodeAnchors = evidenceAnchors.filter((a) => (node ? a.quote.length > 0 : false))

    sidecarNodes.push({
      nodeId: p.nodeId,
      placement: p,
      kind,
      title: sanitizeText(title),
      aliases: aliases.map(sanitizeText),
      evidenceAnchors: nodeAnchors,
      metadata: sanitizeMetadata(metadata),
    })
  }

  // Create edges for relations between nodes placed on this board
  const placementNodeIds = new Set(placements.map((p) => p.nodeId))
  const nodeToPlacementId = new Map(placements.map((p) => [p.nodeId, p.id]))

  const canvasEdges: CanvasEdge[] = []
  const relevantRelations: KnowledgeRelation[] = []

  for (const rel of relations) {
    if (placementNodeIds.has(rel.sourceId) && placementNodeIds.has(rel.targetId)) {
      const fromPlacement = nodeToPlacementId.get(rel.sourceId)
      const toPlacement = nodeToPlacementId.get(rel.targetId)
      if (fromPlacement && toPlacement) {
        canvasEdges.push({
          id: rel.id,
          fromNode: fromPlacement,
          toNode: toPlacement,
          label: `${rel.predicate} (${rel.reviewState})`,
        })
        relevantRelations.push(rel)
      }
    }
  }

  const canvas: JsonCanvasV1 = {
    nodes: canvasNodes,
    edges: canvasEdges,
  }

  const sidecar: CanvasSidecarMetadata = {
    format: "scourgify-canvas-sidecar-v1",
    version: "1.0",
    boardId,
    exportedAt: new Date().toISOString(),
    nodes: sidecarNodes,
    relations: relevantRelations,
  }

  return {
    canvas,
    sidecar,
  }
}
