import { z } from "zod"
import type { AccountApi } from "./accountIpc"
import {
  AI_CONTEXT_MAX_CHARACTERS,
  aiActionSchema,
  aiHistoryMessageSchema,
  aiJobCancelRequestSchema,
  aiJobEventSchema,
  aiJobStartRequestSchema,
  aiJobStartResultSchema,
  aiRequestSchema,
  aiResultSchema,
  aiStreamDeltaSchema,
  aiStreamRequestSchema,
} from "./aiIpc"
import type { BackupApi } from "./backupIpc"
import type { BibliographyApi } from "./bibliographyIpc"
import type {
  CodexAccountStatus,
  CodexLoginCompletedEvent,
  CodexLoginStartResult,
} from "./codexTypes"
import type { CollectionApi } from "./collectionIpc"
import type { DiscoveryApi } from "./discoveryIpc"
import type { DocumentAnalysisSnapshot } from "./documentAnalysis"
import {
  type DocumentAstRequest,
  type DocumentAstResult,
  documentAstRequestSchema,
  documentAstResultSchema,
} from "./documentAstIpc"
import {
  type DocumentLayoutResult,
  documentLayoutRequestSchema,
  documentLayoutResultSchema,
} from "./documentLayout"
import {
  type DocumentOcrProviderStatus,
  documentOcrKeySchema,
  documentOcrProviderStatusSchema,
} from "./documentOcr"
import {
  type DocumentPageParseProgress,
  type DocumentPageParseRequest,
  type DocumentPageParseResult,
  documentPageParseProgressSchema,
  documentPageParseRequestSchema,
  documentPageParseResultSchema,
} from "./documentPageModel"
import type { ExportApi } from "./exportIpc"
import type {
  CanvasExportResult,
  CanvasImportPreview,
  ExperimentImportPreview,
  MarkdownImportPreview,
  ZoteroCommitResult,
  ZoteroImportPreview,
} from "./interchangeTypes"
import type {
  BacklinkItem,
  BoardId,
  BoardRecord,
  CreateEvidenceAnchorInput,
  CreateNodeInput,
  CreatePlacementInput,
  CreateRelationInput,
  DocumentVersionId,
  DocumentVersionRecord,
  EvidenceAnchor,
  EvidenceAnchorId,
  EvidenceNavigationTarget,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
  NodeFilter,
  NodeNeighbourGraph,
  PlacementRecord,
  RelationFilter,
  UpdateNodeInput,
  UpdatePlacementInput,
  UpdateRelationInput,
} from "./knowledgeTypes"
import type { LocalInferenceApi } from "./localInference"
import type { MemoryPreloadApi } from "./memoryIpc"
import type {
  PageTranslationCacheReadRequest,
  PageTranslationCacheResult,
  PageTranslationCacheWriteRequest,
} from "./pageTranslationCache"
import { type AiMode, aiModeSchema, providerKindSchema } from "./providerModels"
import type { ResearchApi } from "./researchIpc"
import {
  type DocumentId,
  documentIdSchema,
  documentRecordSchema,
  type Workspace,
  workspaceSchema,
} from "./schemas"
import type { ScholarlyGraphApi } from "./scholarlyGraphIpc"

export const preparationSteps = [
  "pdf_check",
  "register",
  "layout",
  "text_extract",
  "anchors",
  "metadata",
  "quality",
  "ready",
] as const

export const preparationUpdateSchema = z.object({
  step: z.enum(preparationSteps),
  state: z.enum(["active", "complete", "warning", "failed"]),
  message: z.string().min(1),
})

export const importResultSchema = z
  .object({
    document: documentRecordSchema,
    duplicate: z.boolean(),
  })
  .nullable()

export const documentImportPathRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
})
export const documentImportPathsRequestSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(4_096)).min(1).max(16),
})
export const importProgressSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string().min(1).max(512),
  stage: z.enum(["checking", "extracting", "layout", "complete"]),
  state: z.enum(["active", "complete", "warning", "failed"]),
  progress: z.number().min(0).max(1),
  message: z.string().min(1),
})

export const documentBytesRequestSchema = z.object({ id: documentIdSchema })
export const documentBytesResultSchema = z.string().min(1)

export const workspaceReadResultSchema = workspaceSchema
export const workspaceSaveRequestSchema = workspaceSchema
export const apiKeySchema = z.string().trim().min(20).max(512)
export { providerKindSchema }
export const providerConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("openai"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({
    provider: z.literal("openrouter"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({
    provider: z.literal("gemini"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({
    provider: z.literal("groq"),
    apiKey: apiKeySchema,
    model: z.string().trim().min(1).max(160),
  }),
  z.object({ provider: z.literal("opencodex"), model: z.string().trim().min(1).max(160) }),
])
export const codexReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
])
export type CodexReasoningEffort = z.infer<typeof codexReasoningEffortSchema>

export const providerStatusSchema = z.object({
  configured: z.boolean(),
  provider: providerKindSchema,
  model: z.string().min(1),
  mode: aiModeSchema.optional(),
  codexModel: z.string().optional(),
  codexReasoningEffort: codexReasoningEffortSchema.optional(),
})
export const aiModeRequestSchema = z.object({
  mode: aiModeSchema,
  codexModel: z.string().optional(),
  codexReasoningEffort: codexReasoningEffortSchema.optional(),
})
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:"
    } catch {
      return false
    }
  }, "Only HTTPS URLs are allowed")

export const citationLookupRequestSchema = z.object({
  key: z.string().trim().min(1).max(120),
  currentPaperTitle: z.string().trim().min(1).max(500).optional(),
  title: z.string().trim().max(500).optional(),
  authors: z.string().trim().max(500).optional(),
  year: z.number().int().min(1000).max(9999).nullable().optional(),
  doi: z.string().trim().max(300).nullable().optional(),
  context: z.string().trim().max(1_500).optional(),
})

export const citationPaperSchema = z.object({
  paperId: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string().min(1)),
  year: z.number().int().min(1000).max(9999).nullable(),
  venue: z.string(),
  abstract: z.string().nullable(),
  doi: z.string().nullable(),
  url: z.string().url().nullable(),
  openAccessUrl: z.string().url().nullable(),
  citationCount: z.number().int().nonnegative().nullable(),
})

export const citationIdentityMatchSchema = z.object({
  score: z.number().min(0).max(1),
  signals: z.array(z.string().min(1)).min(1).max(8),
  candidatesCompared: z.number().int().positive(),
})

export const citationLookupResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    paper: citationPaperSchema,
    match: citationIdentityMatchSchema,
    query: z.string().min(1),
  }),
  z.object({ status: z.literal("not_found"), paper: z.null(), query: z.string().min(1) }),
])

export const openExternalRequestSchema = z.object({ url: httpsUrlSchema })
export const clipboardWriteTextRequestSchema = z.object({
  text: z.string().min(1).max(500_000),
})

export { ipcChannels } from "./ipcChannels"

export type ImportResult = z.infer<typeof importResultSchema>
export type ImportProgress = z.infer<typeof importProgressSchema>
export type PreparationUpdate = z.infer<typeof preparationUpdateSchema>
export type ProviderConfig = z.infer<typeof providerConfigSchema>
export type ProviderStatus = z.infer<typeof providerStatusSchema>
export type CitationLookupRequest = z.infer<typeof citationLookupRequestSchema>
export type CitationLookupResult = z.infer<typeof citationLookupResultSchema>
export type CitationPaper = z.infer<typeof citationPaperSchema>
export type CitationIdentityMatch = z.infer<typeof citationIdentityMatchSchema>
export type {
  DocumentAstRequest,
  DocumentAstResult,
  DocumentPageParseProgress,
  DocumentPageParseRequest,
  DocumentPageParseResult,
}

export type ScourgifyApi = {
  readonly backup?: BackupApi
  readonly export?: ExportApi
  readonly account?: AccountApi
  readonly research?: ResearchApi
  readonly memory?: MemoryPreloadApi
  readonly localInference?: LocalInferenceApi
  readonly bibliography?: BibliographyApi
  readonly discovery?: DiscoveryApi
  readonly scholarlyGraph?: ScholarlyGraphApi
  readonly collection?: CollectionApi
  readonly readWorkspace: () => Promise<Workspace>
  readonly saveWorkspace: (workspace: Workspace) => Promise<Workspace>
  readonly importDocument: () => Promise<ImportResult>
  readonly importDocumentPath: (path: string) => Promise<ImportResult>
  readonly importDocumentPaths: (paths: readonly string[]) => Promise<readonly ImportResult[]>
  readonly getDroppedFilePath: (file: File) => string
  readonly onImportProgress: (listener: (progress: ImportProgress) => void) => () => void
  readonly readDocument: (id: DocumentId) => Promise<string>
  readonly readDocumentLayout: (id: DocumentId) => Promise<DocumentLayoutResult>
  readonly parseDocumentPage: (
    request: DocumentPageParseRequest,
  ) => Promise<DocumentPageParseResult>
  readonly onDocumentPageParseProgress: (
    listener: (progress: DocumentPageParseProgress) => void,
  ) => () => void
  readonly readDocumentAnalysis: () => Promise<DocumentAnalysisSnapshot>
  readonly onDocumentAnalysis: (
    listener: (snapshot: DocumentAnalysisSnapshot) => void,
  ) => () => void
  readonly saveDocumentOcrKey: (key: string) => Promise<void>
  readonly documentOcrStatus: () => Promise<DocumentOcrProviderStatus>
  readonly readPageTranslationCache: (
    request: PageTranslationCacheReadRequest,
  ) => Promise<PageTranslationCacheResult>
  readonly writePageTranslationCache: (request: PageTranslationCacheWriteRequest) => Promise<void>
  readonly clearPageTranslationCache: (request: PageTranslationCacheReadRequest) => Promise<void>
  readonly readDocumentAst: (request: DocumentAstRequest) => Promise<DocumentAstResult>
  readonly onPreparation: (listener: (update: PreparationUpdate) => void) => () => void
  readonly saveApiKey: (key: string) => Promise<void>
  readonly saveProviderConfig: (config: ProviderConfig) => Promise<void>
  readonly saveAiMode: (
    input:
      | AiMode
      | { mode: AiMode; codexModel?: string; codexReasoningEffort?: CodexReasoningEffort },
  ) => Promise<void>
  readonly providerStatus: () => Promise<z.infer<typeof providerStatusSchema>>
  readonly runAi: (
    request: z.infer<typeof aiRequestSchema>,
  ) => Promise<z.infer<typeof aiResultSchema>>
  readonly streamAi: (
    request: z.infer<typeof aiRequestSchema>,
    onDelta: (delta: string) => void,
  ) => Promise<z.infer<typeof aiResultSchema>>
  readonly startAiJob: (
    request: z.infer<typeof aiJobStartRequestSchema>,
  ) => Promise<z.infer<typeof aiJobStartResultSchema>>
  readonly cancelAiJob: (jobId: z.infer<typeof aiJobCancelRequestSchema>["jobId"]) => Promise<void>
  readonly onAiJobEvent: (listener: (event: z.infer<typeof aiJobEventSchema>) => void) => () => void
  readonly lookupCitation: (request: CitationLookupRequest) => Promise<CitationLookupResult>
  readonly openExternal: (request: z.infer<typeof openExternalRequestSchema>) => Promise<void>
  readonly writeClipboardText: (text: string) => Promise<void>
  readonly flushWorkspace: () => Promise<void>
  readonly onBeforeWorkspaceClose: (listener: () => Promise<void>) => () => void
  readonly knowledge: {
    readonly linkEvidence: (
      input: import("./knowledgeActions").LinkEvidenceInput,
    ) => Promise<KnowledgeNode>
    readonly proposeRelations: (
      nodeIds: readonly KnowledgeNodeId[],
    ) => Promise<readonly KnowledgeRelation[]>
    readonly cancelProposal: () => Promise<void>
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
    readonly createEvidenceAnchor: (input: CreateEvidenceAnchorInput) => Promise<EvidenceAnchor>
    readonly getEvidenceAnchor: (id: EvidenceAnchorId) => Promise<EvidenceAnchor | null>
    readonly getEvidenceNavigation: (
      anchorId: EvidenceAnchorId,
    ) => Promise<EvidenceNavigationTarget | null>
    readonly createDocumentVersion: (
      version: DocumentVersionRecord,
    ) => Promise<DocumentVersionRecord>
    readonly getDocumentVersion: (id: DocumentVersionId) => Promise<DocumentVersionRecord | null>
    readonly findDocumentVersionsByHash: (hash: string) => Promise<readonly DocumentVersionRecord[]>
    readonly getOrCreateDefaultBoard: () => Promise<BoardRecord>
    readonly listBoards: () => Promise<readonly BoardRecord[]>
    readonly createBoard: (title: string, description?: string) => Promise<BoardRecord>
    readonly getBoard: (id: BoardId) => Promise<BoardRecord | null>
    readonly findPlacementsForBoard: (boardId: BoardId) => Promise<readonly PlacementRecord[]>
    readonly findPlacementsForNode: (nodeId: KnowledgeNodeId) => Promise<readonly PlacementRecord[]>
    readonly createPlacement: (input: CreatePlacementInput) => Promise<PlacementRecord>
    readonly updatePlacement: (input: UpdatePlacementInput) => Promise<PlacementRecord>
    readonly deletePlacement: (id: PlacementRecord["id"]) => Promise<boolean>
  }
  readonly codex: {
    readonly getStatus: () => Promise<CodexAccountStatus>
    readonly startLogin: (type?: string) => Promise<CodexLoginStartResult>
    readonly cancelLogin: (loginId: string) => Promise<void>
    readonly logout: () => Promise<void>
    readonly onLoginCompleted: (listener: (event: CodexLoginCompletedEvent) => void) => () => void
  }
  readonly interchange: {
    readonly exportMarkdown: (nodeId: KnowledgeNodeId) => Promise<string>
    readonly previewMarkdownImport: (
      files: readonly string[],
    ) => Promise<MarkdownImportPreview & { readonly previewId: string }>
    readonly commitMarkdownImport: (
      previewId: string,
    ) => Promise<{ readonly createdNodes: readonly KnowledgeNode[] }>
    readonly exportCanvas: (boardId: BoardId) => Promise<CanvasExportResult>
    readonly previewCanvasImport: (
      canvasJson: string,
      sidecarJson: string,
    ) => Promise<CanvasImportPreview & { readonly previewId: string }>
    readonly commitCanvasImport: (
      previewId: string,
      targetBoardId: BoardId,
    ) => Promise<readonly PlacementRecord[]>
    readonly previewExperimentJsonl: (
      rawLines: string,
    ) => Promise<ExperimentImportPreview & { readonly previewId: string }>
    readonly commitExperiment: (
      request: z.infer<typeof import("./interchangeIpc").interchangeExperimentCommitRequestSchema>,
    ) => Promise<z.infer<typeof import("./interchangeIpc").experimentCommitResultSchema>>
    readonly previewZoteroFile: (
      rawJson: string,
      libraryKey?: string,
    ) => Promise<ZoteroImportPreview & { readonly previewId: string }>
    readonly fetchAndPreviewLocalZotero: (
      options?: Record<string, unknown>,
      libraryKey?: string,
    ) => Promise<ZoteroImportPreview & { readonly previewId: string }>
    readonly commitZotero: (previewId: string) => Promise<ZoteroCommitResult>
    readonly chooseFiles: (request: {
      readonly filters?: readonly {
        readonly name: string
        readonly extensions: readonly string[]
      }[]
      readonly multiple?: boolean
    }) => Promise<readonly { readonly name: string; readonly content: string }[]>
    readonly saveFile: (request: {
      readonly defaultName: string
      readonly content: string
      readonly filters?: readonly {
        readonly name: string
        readonly extensions: readonly string[]
      }[]
    }) => Promise<{ readonly saved: boolean; readonly filePath: string | null }>
  }
}

export type {
  AiAction,
  AiHistoryMessage,
  AiJobEvent,
  AiJobStartRequest,
  AiRequest,
  AiStreamDelta,
} from "./aiIpc"
export {
  AI_CONTEXT_MAX_CHARACTERS,
  aiActionSchema,
  aiHistoryMessageSchema,
  aiJobCancelRequestSchema,
  aiJobEventSchema,
  aiJobStartRequestSchema,
  aiJobStartResultSchema,
  aiRequestSchema,
  aiResultSchema,
  aiStreamDeltaSchema,
  aiStreamRequestSchema,
  documentAstRequestSchema,
  documentAstResultSchema,
  documentLayoutRequestSchema,
  documentLayoutResultSchema,
  documentOcrKeySchema,
  documentOcrProviderStatusSchema,
  documentPageParseProgressSchema,
  documentPageParseRequestSchema,
  documentPageParseResultSchema,
}
