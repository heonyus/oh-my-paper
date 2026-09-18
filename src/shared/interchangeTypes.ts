import type {
  CanvasSidecarMetadata,
  ExperimentRecordV1,
  JsonCanvasV1,
  MarkdownFrontMatter,
} from "./interchangeSchemas"
import type {
  BoardId,
  ExternalMapping,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
  PlacementRecord,
} from "./knowledgeSchemas"

export type {
  CanvasEdge,
  CanvasNode,
  CanvasSidecarMetadata,
  CanvasSidecarNode,
  ExperimentRecordV1,
  JsonCanvasV1,
  MarkdownFrontMatter,
  MarkdownOutgoingRelation,
  MarkdownRelationItem,
  ZoteroApiResponseItem,
  ZoteroCreator,
  ZoteroItemData,
} from "./interchangeSchemas"

export interface ParsedMarkdownNode {
  readonly frontMatter: MarkdownFrontMatter
  readonly body: string
}

export interface MarkdownConflict {
  readonly nodeId: KnowledgeNodeId
  readonly existingTitle: string
  readonly importedTitle: string
  readonly hasDifferentKind: boolean
  readonly hasDifferentBody: boolean
  readonly existingAliases: readonly string[]
  readonly importedAliases: readonly string[]
}

export interface MarkdownImportPreview {
  readonly parsedNodes: readonly ParsedMarkdownNode[]
  readonly conflicts: readonly MarkdownConflict[]
  readonly newNodes: readonly ParsedMarkdownNode[]
  readonly parseErrors: readonly { readonly fileIndex: number; readonly error: string }[]
  readonly duplicateIdsInBatch: readonly KnowledgeNodeId[]
  readonly isValid: boolean
}

export interface MarkdownImportCommitResult {
  readonly createdNodes: readonly KnowledgeNode[]
  readonly skippedNodeIds: readonly KnowledgeNodeId[]
}

export interface CanvasExportResult {
  readonly canvas: JsonCanvasV1
  readonly sidecar: CanvasSidecarMetadata
}

export interface CanvasImportPreview {
  readonly boardId: string
  readonly nodesToPlace: readonly {
    readonly nodeId: KnowledgeNodeId
    readonly title: string
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number | null
  }[]
  readonly relations: readonly KnowledgeRelation[]
  readonly missingNodes: readonly string[]
  readonly isValid: boolean
}

export interface ExperimentImportPreview {
  readonly records: readonly ExperimentRecordV1[]
  readonly errors: readonly { readonly line: number; readonly message: string }[]
  readonly sensitiveKeysDetected: readonly string[]
  readonly isValid: boolean
}

export interface ExperimentCommitOptions {
  readonly hypothesisNodeId?: KnowledgeNodeId
  readonly targetBoardId?: BoardId
}

export interface ExperimentCommitResult {
  readonly createdNodes: readonly KnowledgeNode[]
  readonly mappedRunIds: readonly string[]
  readonly createdRelations: readonly KnowledgeRelation[]
  readonly createdPlacements: readonly PlacementRecord[]
}

export interface ZoteroImportItemPreview {
  readonly libraryKey: string
  readonly itemKey: string
  readonly title: string
  readonly itemType: string
  readonly doi: string | null
  readonly date: string
  readonly creators: readonly string[]
  readonly abstractNote: string
  readonly existingMapping: ExternalMapping | null
  readonly matchType: "none" | "external_id_match" | "doi_match"
  readonly libraryType?: string | undefined
  readonly libraryId?: string | number | undefined
  readonly proposedMergeNodeId?: KnowledgeNodeId | null | undefined
}

export interface ZoteroImportPreview {
  readonly items: readonly ZoteroImportItemPreview[]
  readonly duplicateKeysInBatch: readonly string[]
  readonly totalItems: number
  readonly isValid: boolean
  readonly invalidCount?: number | undefined
  readonly validationErrors?:
    | readonly { readonly index: number; readonly error: string }[]
    | undefined
}

export interface ZoteroCommitResult {
  readonly createdNodeIds: readonly KnowledgeNodeId[]
  readonly mappedExternalIds: readonly string[]
  readonly skippedItemKeys: readonly string[]
}

export interface ZoteroCommitOptions {
  readonly approvedMergeExternalIds?: readonly string[]
  readonly approvedMergeItemKeys?: readonly string[]
}

export interface ZoteroFetchResult {
  readonly items: readonly import("./interchangeSchemas").ZoteroItemData[]
  readonly totalResults: number | null
  readonly validCount: number
  readonly invalidCount: number
  readonly validationErrors: readonly { readonly index: number; readonly error: string }[]
}
