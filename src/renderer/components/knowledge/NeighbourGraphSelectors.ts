import type {
  KnowledgeNodeId,
  KnowledgeRelation,
  RelationPredicate,
  RelationReviewState,
} from "../../../shared/knowledgeSchemas"
import { relationReviewStateSchema } from "../../../shared/knowledgeSchemas"
import type { NodeNeighbourGraph } from "../../../shared/knowledgeTypes"

export type GraphFilterCategory = "all" | "citation" | "concept" | "research"

export interface GraphPosition {
  readonly x: number
  readonly y: number
}

export const GRAPH_WORLD = {
  width: 1_000,
  height: 640,
} as const

function assertNever(value: never): never {
  throw new Error(`지원하지 않는 관계 종류: ${String(value)}`)
}

export function categoryFor(predicate: RelationPredicate): Exclude<GraphFilterCategory, "all"> {
  switch (predicate) {
    case "cites":
      return "citation"
    case "discusses":
    case "interprets":
    case "relates_to":
      return "concept"
    case "motivates":
    case "tests":
    case "supported_by":
    case "refutes":
      return "research"
    default:
      return assertNever(predicate)
  }
}

export function parseReview(value: string): "all" | RelationReviewState | null {
  return value === "all" ? "all" : (relationReviewStateSchema.safeParse(value).data ?? null)
}

export function graphPositions(
  graph: NodeNeighbourGraph,
  nodes: readonly NodeNeighbourGraph["nodes"][number][],
): ReadonlyMap<KnowledgeNodeId, GraphPosition> {
  const positions = new Map<KnowledgeNodeId, GraphPosition>()
  positions.set(graph.rootNode.id, { x: GRAPH_WORLD.width / 2, y: GRAPH_WORLD.height / 2 })
  const neighbours = nodes.filter((node) => node.id !== graph.rootNode.id)
  neighbours.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(neighbours.length, 1) - Math.PI / 2
    const radiusX = Math.min(340, 180 + neighbours.length * 18)
    const radiusY = Math.min(220, 130 + neighbours.length * 10)
    positions.set(node.id, {
      x: GRAPH_WORLD.width / 2 + Math.cos(angle) * radiusX,
      y: GRAPH_WORLD.height / 2 + Math.sin(angle) * radiusY,
    })
  })
  return positions
}

export function relationsForNode(
  graph: NodeNeighbourGraph,
  nodeId: KnowledgeNodeId | null,
): readonly KnowledgeRelation[] {
  return nodeId
    ? graph.relations.filter(
        (relation) => relation.sourceId === nodeId || relation.targetId === nodeId,
      )
    : []
}

export function proposalsFor(
  relations: readonly KnowledgeRelation[],
): readonly KnowledgeRelation[] {
  return relations.filter(
    (relation) => relation.reviewState === "proposed" || relation.reviewState === "needs_review",
  )
}
