import { z } from "zod"
import { agentAskRequestSchema, agentAskResultSchema } from "../shared/agentChat"
import { jevDecisionResultSchema } from "../shared/aiDecision"
import {
  type DiscoveryApi,
  discoveryCancelResultSchema,
  discoverySavedMetadataResultSchema,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
  discoverySearchInputSchema,
} from "../shared/discoveryIpc"
import { documentAnalysisSnapshotSchema } from "../shared/documentAnalysis"
import type { DocumentAstRequest } from "../shared/documentAstIpc"
import { documentAstResultSchema } from "../shared/documentAstIpc"
import type { DocumentOcrProviderStatus } from "../shared/documentOcr"
import type {
  CitationLookupRequest,
  CitationLookupResult,
  DocumentPageParseRequest,
  DocumentPageParseResult,
  OhMyPaperApi,
  PreparationUpdate,
  ProviderStatus,
} from "../shared/ipc"
import {
  aiModeRequestSchema,
  citationLookupResultSchema,
  documentImportUrlRequestSchema,
  documentOcrProviderStatusSchema,
  importResultSchema,
  providerStatusSchema,
} from "../shared/ipc"
import type {
  PageTranslationCacheReadRequest,
  PageTranslationCacheResult,
  PageTranslationCacheWriteRequest,
} from "../shared/pageTranslationCache"
import { pageTranslationCacheResultSchema } from "../shared/pageTranslationCache"
import type { DocumentId, Workspace } from "../shared/schemas"
import { workspaceSchema } from "../shared/schemas"
import { scholarlySearchResultSchema } from "../shared/scholarlySearchSchemas"
import { unavailableWebFeature } from "../shared/unavailableWebFeatures"
import { agentAskStream } from "./localAgentStream"
import { createLocalAiJobs } from "./localAiJobs"
import { createLocalClaudeApi } from "./localClaudeApi"
import { createLocalCodexApi } from "./localCodexApi"
import { createLocalImporter } from "./localImport"
import { createLocalPageParser } from "./localPageParser"
import { localRpc, readLocalResponse } from "./localTransport"

export function installLocalReaderApi(): void {
  const importer = createLocalImporter()
  const aiJobs = createLocalAiJobs()
  const pageParser = createLocalPageParser()
  let _activeDocumentId: DocumentId | null = null
  const discovery: DiscoveryApi = {
    search: async (input) => {
      const parsed = discoverySearchInputSchema.parse(input)
      const response = await fetch("/api/rpc/scholarlySearch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.request),
        signal: AbortSignal.timeout(30_000),
      })
      return readLocalResponse(response, scholarlySearchResultSchema)
    },
    cancel: async () => discoveryCancelResultSchema.parse({ cancelled: false }),
    saveMetadata: async (input) => {
      const parsed = discoverySaveInputSchema.parse(input)
      const response = await fetch("/api/rpc/discoverySaveMetadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(30_000),
      })
      return readLocalResponse(response, discoverySaveResultSchema)
    },
    listSavedMetadata: async () => {
      const response = await fetch("/api/rpc/discoveryListSavedMetadata", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      })
      return readLocalResponse(response, discoverySavedMetadataResultSchema)
    },
  }

  const api: OhMyPaperApi = {
    discovery,
    readWorkspace: async (): Promise<Workspace> => {
      const response = await fetch("/api/workspace", { signal: AbortSignal.timeout(30_000) })
      return readLocalResponse(response, workspaceSchema)
    },
    saveWorkspace: async (workspace: Workspace): Promise<Workspace> => {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(workspace),
        signal: AbortSignal.timeout(30_000),
      })
      return readLocalResponse(response, workspaceSchema)
    },
    importDocument: importer.importDocument,
    importDocumentPath: importer.importDocumentPath,
    importDocumentPaths: importer.importDocumentPaths,
    deleteDocument: async (id: DocumentId): Promise<void> => {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(60_000),
      })
      await readLocalResponse(response, z.object({ ok: z.literal(true) }))
    },
    importDocumentUrl: async (url: string) => {
      const response = await fetch("/api/documents/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(documentImportUrlRequestSchema.parse({ url })),
        signal: AbortSignal.timeout(180_000),
      })
      return readLocalResponse(response, importResultSchema)
    },
    getDroppedFilePath: importer.getDroppedFilePath,
    onImportProgress: importer.onImportProgress,
    readDocument: async (id: DocumentId): Promise<string> => {
      _activeDocumentId = id
      const response = await fetch(`/api/documents/${id}/base64`, {
        signal: AbortSignal.timeout(60_000),
      })
      return readLocalResponse(response, z.string())
    },
    readDocumentLayout: async () => ({ status: "unavailable", reason: "runtime_missing" }),
    parseDocumentPage: async (
      request: DocumentPageParseRequest,
      signal?: AbortSignal,
    ): Promise<DocumentPageParseResult> => {
      _activeDocumentId = request.id
      return pageParser.parse(request, signal)
    },
    onDocumentPageParseProgress: pageParser.onProgress,
    readDocumentAnalysis: async () =>
      localRpc("documentAnalysisStatus", {}, documentAnalysisSnapshotSchema),
    onDocumentAnalysis: (listener) => {
      const events = new EventSource("/api/events/document-analysis")
      events.onmessage = (event) =>
        listener(documentAnalysisSnapshotSchema.parse(JSON.parse(event.data)))
      return () => events.close()
    },
    retryDocumentAnalysis: async (id) => {
      await localRpc("retryDocumentAnalysis", { id }, documentAnalysisSnapshotSchema)
    },
    documentOcrStatus: async (): Promise<DocumentOcrProviderStatus> => {
      return localRpc("documentOcrStatus", {}, documentOcrProviderStatusSchema)
    },
    readPageTranslationCache: async (
      request: PageTranslationCacheReadRequest,
    ): Promise<PageTranslationCacheResult> => {
      _activeDocumentId = request.id
      return localRpc("readPageTranslationCache", request, pageTranslationCacheResultSchema)
    },
    writePageTranslationCache: async (request: PageTranslationCacheWriteRequest): Promise<void> => {
      await localRpc("writePageTranslationCache", request, z.object({ ok: z.boolean() }))
    },
    clearPageTranslationCache: async (request: PageTranslationCacheReadRequest): Promise<void> => {
      await localRpc("clearPageTranslationCache", request, z.object({ ok: z.boolean() }))
    },
    readDocumentAst: async (request: DocumentAstRequest) => {
      return localRpc("readDocumentAst", request, documentAstResultSchema)
    },
    onPreparation: (_listener: (update: PreparationUpdate) => void) => () => {},
    saveApiKey: unavailableWebFeature("provider.saveApiKey"),
    saveProviderConfig: async (config) => {
      await localRpc("saveProviderConfig", config, providerStatusSchema)
    },
    saveAiMode: async (input) => {
      const request = aiModeRequestSchema.parse(typeof input === "string" ? { mode: input } : input)
      await localRpc("saveAiMode", request, providerStatusSchema)
    },
    providerStatus: async (): Promise<ProviderStatus> => {
      return localRpc("providerStatus", {}, providerStatusSchema)
    },
    agentAsk: async (request) => {
      const parsed = agentAskRequestSchema.parse(request)
      return localRpc("agentAsk", parsed, agentAskResultSchema)
    },
    agentAskStream: async (request, onStep, signal) => agentAskStream(request, onStep, signal),
    runAi: async (request) => {
      _activeDocumentId = request.documentId
      return localRpc("runAi", request, z.object({ text: z.string(), model: z.string() }))
    },
    decideAi: async (request, signal) => {
      const response = await fetch("/api/rpc/decideAi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      })
      return readLocalResponse(response, jevDecisionResultSchema)
    },
    streamAi: async (request, onDelta) => {
      _activeDocumentId = request.documentId
      const result = await localRpc(
        "runAi",
        request,
        z.object({ text: z.string(), model: z.string() }),
      )
      onDelta(result.text)
      return result
    },
    startAiJob: aiJobs.startAiJob,
    cancelAiJob: aiJobs.cancelAiJob,
    onAiJobEvent: aiJobs.onAiJobEvent,
    lookupCitation: async (request: CitationLookupRequest): Promise<CitationLookupResult> => {
      return localRpc("lookupCitation", request, citationLookupResultSchema)
    },
    openExternal: async (request) => {
      window.open(request.url, "_blank", "noopener,noreferrer")
    },
    writeClipboardText: async (text: string) => {
      await navigator.clipboard.writeText(text)
    },
    flushWorkspace: async () => {},
    onBeforeWorkspaceClose: () => () => {},
    knowledge: {
      linkEvidence: unavailableWebFeature("knowledge.linkEvidence"),
      proposeRelations: unavailableWebFeature("knowledge.proposeRelations"),
      cancelProposal: unavailableWebFeature("knowledge.cancelProposal"),
      findNodes: unavailableWebFeature("knowledge.findNodes"),
      getNode: unavailableWebFeature("knowledge.getNode"),
      createNode: unavailableWebFeature("knowledge.createNode"),
      updateNode: unavailableWebFeature("knowledge.updateNode"),
      deleteNode: unavailableWebFeature("knowledge.deleteNode"),
      findRelations: unavailableWebFeature("knowledge.findRelations"),
      createRelation: unavailableWebFeature("knowledge.createRelation"),
      updateRelation: unavailableWebFeature("knowledge.updateRelation"),
      getBacklinks: unavailableWebFeature("knowledge.getBacklinks"),
      getNeighbourGraph: unavailableWebFeature("knowledge.getNeighbourGraph"),
      createEvidenceAnchor: unavailableWebFeature("knowledge.createEvidenceAnchor"),
      getEvidenceAnchor: unavailableWebFeature("knowledge.getEvidenceAnchor"),
      getEvidenceNavigation: unavailableWebFeature("knowledge.getEvidenceNavigation"),
      createDocumentVersion: unavailableWebFeature("knowledge.createDocumentVersion"),
      getDocumentVersion: unavailableWebFeature("knowledge.getDocumentVersion"),
      findDocumentVersionsByHash: unavailableWebFeature("knowledge.findDocumentVersionsByHash"),
      getOrCreateDefaultBoard: unavailableWebFeature("knowledge.getOrCreateDefaultBoard"),
      listBoards: unavailableWebFeature("knowledge.listBoards"),
      createBoard: unavailableWebFeature("knowledge.createBoard"),
      getBoard: unavailableWebFeature("knowledge.getBoard"),
      findPlacementsForBoard: unavailableWebFeature("knowledge.findPlacementsForBoard"),
      findPlacementsForNode: unavailableWebFeature("knowledge.findPlacementsForNode"),
      createPlacement: unavailableWebFeature("knowledge.createPlacement"),
      updatePlacement: unavailableWebFeature("knowledge.updatePlacement"),
      deletePlacement: unavailableWebFeature("knowledge.deletePlacement"),
    },
    codex: createLocalCodexApi(),
    claude: createLocalClaudeApi(),
    interchange: {
      exportMarkdown: unavailableWebFeature("interchange.exportMarkdown"),
      previewMarkdownImport: unavailableWebFeature("interchange.previewMarkdownImport"),
      commitMarkdownImport: unavailableWebFeature("interchange.commitMarkdownImport"),
      exportCanvas: unavailableWebFeature("interchange.exportCanvas"),
      previewCanvasImport: unavailableWebFeature("interchange.previewCanvasImport"),
      commitCanvasImport: unavailableWebFeature("interchange.commitCanvasImport"),
      previewExperimentJsonl: unavailableWebFeature("interchange.previewExperimentJsonl"),
      commitExperiment: unavailableWebFeature("interchange.commitExperiment"),
      previewZoteroFile: unavailableWebFeature("interchange.previewZoteroFile"),
      fetchAndPreviewLocalZotero: unavailableWebFeature("interchange.fetchAndPreviewLocalZotero"),
      commitZotero: unavailableWebFeature("interchange.commitZotero"),
      chooseFiles: unavailableWebFeature("interchange.chooseFiles"),
      saveFile: unavailableWebFeature("interchange.saveFile"),
    },
  }

  Object.defineProperty(window, "ohmypaper", { value: api, configurable: true })
}
