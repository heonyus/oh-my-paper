import { z } from "zod"
import type { DocumentAstRequest } from "../shared/documentAstIpc"
import { documentAstResultSchema } from "../shared/documentAstIpc"
import type {
  CitationLookupRequest,
  CitationLookupResult,
  DocumentOcrProviderStatus,
  DocumentPageParseProgress,
  DocumentPageParseRequest,
  DocumentPageParseResult,
  PreparationUpdate,
  ProviderConfig,
  ProviderStatus,
  ScourgifyApi,
} from "../shared/ipc"
import {
  citationLookupResultSchema,
  documentOcrProviderStatusSchema,
  documentPageParseResultSchema,
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
import { createLocalAiJobs } from "./localAiJobs"
import { createLocalImporter } from "./localImport"
import { localRpc, readLocalResponse } from "./localTransport"

export function installLocalReaderApi(): void {
  const importer = createLocalImporter()
  const aiJobs = createLocalAiJobs()
  let _activeDocumentId: DocumentId | null = null

  const api: ScourgifyApi = {
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
    ): Promise<DocumentPageParseResult> => {
      _activeDocumentId = request.id
      return localRpc("parseDocumentPage", request, documentPageParseResultSchema)
    },
    onDocumentPageParseProgress:
      (_listener: (progress: DocumentPageParseProgress) => void) => () => {},
    readDocumentAnalysis: async () => [],
    onDocumentAnalysis: (_listener) => () => {},
    saveDocumentOcrKey: async () => {},
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
    saveApiKey: async () => {},
    saveProviderConfig: async (_config: ProviderConfig) => {},
    saveAiMode: async () => {},
    providerStatus: async (): Promise<ProviderStatus> => {
      return localRpc("providerStatus", {}, providerStatusSchema)
    },
    runAi: async (request) => {
      _activeDocumentId = request.documentId
      return localRpc("runAi", request, z.object({ text: z.string(), model: z.string() }))
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
      linkEvidence: async () => {
        throw new Error("not_supported_in_web")
      },
      proposeRelations: async () => [],
      cancelProposal: async () => {},
      findNodes: async () => [],
      getNode: async () => null,
      createNode: async () => {
        throw new Error("not_supported_in_web")
      },
      updateNode: async () => {
        throw new Error("not_supported_in_web")
      },
      deleteNode: async () => false,
      findRelations: async () => [],
      createRelation: async () => {
        throw new Error("not_supported_in_web")
      },
      updateRelation: async () => {
        throw new Error("not_supported_in_web")
      },
      getBacklinks: async () => [],
      getNeighbourGraph: async () => {
        throw new Error("not_supported_in_web")
      },
      createEvidenceAnchor: async () => {
        throw new Error("not_supported_in_web")
      },
      getEvidenceAnchor: async () => null,
      getEvidenceNavigation: async () => null,
      createDocumentVersion: async (v) => v,
      getDocumentVersion: async () => null,
      findDocumentVersionsByHash: async () => [],
      getOrCreateDefaultBoard: async () => {
        throw new Error("not_supported_in_web")
      },
      listBoards: async () => [],
      createBoard: async () => {
        throw new Error("not_supported_in_web")
      },
      getBoard: async () => null,
      findPlacementsForBoard: async () => [],
      findPlacementsForNode: async () => [],
      createPlacement: async () => {
        throw new Error("not_supported_in_web")
      },
      updatePlacement: async () => {
        throw new Error("not_supported_in_web")
      },
      deletePlacement: async () => true,
    },
    codex: {
      getStatus: async () => ({ configured: false, loggedIn: false, plan: null }),
      startLogin: async () => ({ loginId: "", verificationUri: "", userCode: "" }),
      cancelLogin: async () => {},
      logout: async () => {},
      onLoginCompleted: () => () => {},
    },
    interchange: {
      exportMarkdown: async () => "",
      previewMarkdownImport: async () => ({
        previewId: "",
        validFiles: [],
        conflictFiles: [],
        totalNodes: 0,
      }),
      commitMarkdownImport: async () => ({ createdNodes: [] }),
      exportCanvas: async () => ({ canvasJson: "", sidecarJson: "" }),
      previewCanvasImport: async () => ({
        previewId: "",
        totalNodes: 0,
        totalEdges: 0,
        missingNodes: [],
      }),
      commitCanvasImport: async () => [],
      previewExperimentJsonl: async () => ({
        previewId: "",
        totalRecords: 0,
        validRecords: 0,
        invalidLines: [],
      }),
      commitExperiment: async () => {
        throw new Error("not_supported_in_web")
      },
      previewZoteroFile: async () => ({ previewId: "", collections: [], items: [] }),
      fetchAndPreviewLocalZotero: async () => ({ previewId: "", collections: [], items: [] }),
      commitZotero: async () => ({ importedCollections: 0, importedItems: 0 }),
      chooseFiles: async () => [],
      saveFile: async () => ({ saved: false, filePath: null }),
    },
  }

  Object.defineProperty(window, "scourgify", { value: api, configurable: true })
}
