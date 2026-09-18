import type { KnowledgeEndpoint } from "./fragmentAnchors"

export type {
  BoardId,
  BoardRecord,
  DocumentVersionId,
  DocumentVersionRecord,
  EvidenceAnchor,
  EvidenceAnchorId,
  ExternalMapping,
  ExternalMappingId,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeNodeKind,
  KnowledgeRelation,
  KnowledgeRelationId,
  PlacementId,
  PlacementRecord,
  RelationPredicate,
  RelationProvenance,
  RelationProvenanceSource,
  RelationReviewState,
} from "./knowledgeSchemas"

import type {
  BoardId,
  DocumentVersionId,
  EvidenceAnchor,
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeNodeKind,
  KnowledgeRelation,
  KnowledgeRelationId,
  PlacementId,
  RelationPredicate,
  RelationProvenance,
  RelationReviewState,
} from "./knowledgeSchemas"

export interface NodeFilter {
  readonly kind?: KnowledgeNodeKind | undefined
  readonly search?: string | undefined
  readonly limit?: number | undefined
  readonly offset?: number | undefined
}

export interface NeighbourGraphOptions {
  readonly maxNodes?: number | undefined
  readonly maxEdges?: number | undefined
}

export interface RelationFilter {
  readonly nodeId?: KnowledgeNodeId | undefined
  readonly predicate?: RelationPredicate | undefined
  readonly reviewState?: RelationReviewState | undefined
}

export interface BacklinkItem {
  readonly relation: KnowledgeRelation
  readonly sourceNode: KnowledgeNode
  readonly evidenceAnchors: readonly EvidenceAnchor[]
}

export interface NodeNeighbourGraph {
  readonly rootNode: KnowledgeNode
  readonly depth: number
  readonly nodes: readonly KnowledgeNode[]
  readonly relations: readonly KnowledgeRelation[]
  readonly evidenceAnchors: readonly EvidenceAnchor[]
  readonly truncated?: boolean | undefined
}

export interface CreateNodeInput {
  readonly id?: KnowledgeNodeId | undefined
  readonly kind: KnowledgeNodeKind
  readonly title: string
  readonly body?: string | undefined
  readonly aliases?: readonly string[] | undefined
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

export interface UpdateNodeInput {
  readonly id: KnowledgeNodeId
  readonly expectedBody?: string | undefined
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly aliases?: readonly string[] | undefined
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

export interface CreateRelationInput {
  readonly id?: KnowledgeRelationId | undefined
  readonly sourceId: KnowledgeNodeId
  readonly targetId: KnowledgeNodeId
  readonly sourceEndpoint?: KnowledgeEndpoint | undefined
  readonly targetEndpoint?: KnowledgeEndpoint | undefined
  readonly predicate: RelationPredicate
  readonly provenance: RelationProvenance
  readonly evidenceIds?: readonly EvidenceAnchorId[] | undefined
  readonly reviewState?: RelationReviewState | undefined
}

export interface UpdateRelationInput {
  readonly id: KnowledgeRelationId
  readonly predicate?: RelationPredicate | undefined
  readonly reviewState?: RelationReviewState | undefined
  readonly evidenceIds?: readonly EvidenceAnchorId[] | undefined
  readonly sourceEndpoint?: KnowledgeEndpoint | undefined
  readonly targetEndpoint?: KnowledgeEndpoint | undefined
}

export interface CreateEvidenceAnchorInput {
  readonly id?: EvidenceAnchorId | undefined
  readonly documentVersionId: DocumentVersionId
  readonly page: number
  readonly quote: string
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly fragments?:
    | readonly {
        readonly x: number
        readonly y: number
        readonly width: number
        readonly height: number
      }[]
    | undefined
  readonly astRanges?:
    | readonly {
        readonly sourceItemId: string
        readonly start: number
        readonly end: number
      }[]
    | undefined
}

export interface CreatePlacementInput {
  readonly id?: PlacementId | undefined
  readonly boardId: BoardId
  readonly nodeId: KnowledgeNodeId
  readonly cardId?: string | null | undefined
  readonly x: number
  readonly y: number
  readonly width?: number | undefined
  readonly height?: number | null | undefined
  readonly minimized?: boolean | undefined
  readonly zIndex?: number | undefined
}

export interface UpdatePlacementInput {
  readonly id: PlacementId
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly width?: number | undefined
  readonly height?: number | null | undefined
  readonly minimized?: boolean | undefined
  readonly zIndex?: number | undefined
}

export interface EvidenceNavigationTarget {
  readonly anchorId: EvidenceAnchorId
  readonly documentVersionId: DocumentVersionId
  readonly originalDocumentId: string
  readonly hash: string
  readonly page: number
  readonly quote: string
  readonly x: number
  readonly y: number
  readonly fragments: readonly {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }[]
}
