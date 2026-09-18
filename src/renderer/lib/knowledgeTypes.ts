import type {
  BoardRecord,
  EvidenceAnchor,
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
  PlacementRecord,
} from "../../shared/knowledgeSchemas"
import type {
  BacklinkItem,
  CreateNodeInput,
  CreatePlacementInput,
  CreateRelationInput,
  DocumentVersionRecord,
  EvidenceNavigationTarget,
  NodeFilter,
  NodeNeighbourGraph,
  RelationFilter,
  UpdateNodeInput,
  UpdatePlacementInput,
  UpdateRelationInput,
} from "../../shared/knowledgeTypes"

export type WorkspaceViewMode =
  | "reader"
  | "knowledge"
  | "graph"
  | "compare"
  | "project"
  | "search"
  | "memory"

export interface KnowledgeClientOps {
  readonly findNodes: (filter?: NodeFilter) => Promise<readonly KnowledgeNode[]>
  readonly getNode: (id: KnowledgeNodeId) => Promise<KnowledgeNode | null>
  readonly createNode: (input: CreateNodeInput) => Promise<KnowledgeNode>
  readonly updateNode: (input: UpdateNodeInput) => Promise<KnowledgeNode>
  readonly deleteNode: (id: KnowledgeNodeId) => Promise<boolean>
  readonly findRelations: (filter?: RelationFilter) => Promise<readonly KnowledgeRelation[]>
  readonly createRelation: (input: CreateRelationInput) => Promise<KnowledgeRelation>
  readonly updateRelation: (input: UpdateRelationInput) => Promise<KnowledgeRelation>
  readonly getBacklinks: (nodeId: KnowledgeNodeId) => Promise<readonly BacklinkItem[]>
  readonly getNeighbourGraph: (
    nodeId: KnowledgeNodeId,
    maxDepth?: number,
  ) => Promise<NodeNeighbourGraph>
  readonly getEvidenceNavigation: (
    anchorId: EvidenceAnchorId,
  ) => Promise<EvidenceNavigationTarget | null>
  readonly createEvidenceAnchor?: (
    input: import("../../shared/knowledgeTypes").CreateEvidenceAnchorInput,
  ) => Promise<EvidenceAnchor>
  readonly getEvidenceAnchor: (anchorId: EvidenceAnchorId) => Promise<EvidenceAnchor | null>
  readonly getDocVersionsByHash: (hash: string) => Promise<readonly DocumentVersionRecord[]>
  readonly getOrCreateDefaultBoard: () => Promise<BoardRecord>
  readonly listBoards: () => Promise<readonly BoardRecord[]>
  readonly createBoard: (title: string, description?: string) => Promise<BoardRecord>
  readonly findPlacementsForBoard: (
    boardId: BoardRecord["id"],
  ) => Promise<readonly PlacementRecord[]>
  readonly createPlacement: (input: CreatePlacementInput) => Promise<PlacementRecord>
  readonly updatePlacement: (input: UpdatePlacementInput) => Promise<PlacementRecord>
  readonly deletePlacement: (id: PlacementRecord["id"]) => Promise<boolean>
}

export function metadataString(node: KnowledgeNode, key: string): string | null {
  const value = node.metadata[key]
  return typeof value === "string" && value.trim() ? value : null
}

export function metadataBoolean(node: KnowledgeNode, key: string): boolean | null {
  const value = node.metadata[key]
  return typeof value === "boolean" ? value : null
}
