import type { AiJobEvent } from "../shared/aiIpc"
import { CODEX_MODEL_OPTIONS } from "../shared/codexTypes"
import { type DocumentAnalysisSnapshot, hasActiveAnalysis } from "../shared/documentAnalysis"
import type { DocumentPageParseProgress } from "../shared/documentPageModel"
import {
  clipboardWriteTextRequestSchema,
  type ImportProgress,
  type OhMyPaperApi,
  openExternalRequestSchema,
  type PreparationUpdate,
} from "../shared/ipc"
import type { DocumentId } from "../shared/schemas"
import { unavailableWebFeature } from "../shared/unavailableWebFeatures"
import { GEMINI_WEB_MODEL, GROQ_WEB_MODELS } from "../shared/webCredentials"
import { fetchHostedCredentialStatus, saveHostedCredential, WebApiError } from "./api"
import { WebWorkspaceBridge } from "./webWorkspace"

let installedUserId: string | null = null

export function installWebOhMyPaperApi(userId: string): void {
  if (installedUserId === userId) return
  const bridge = new WebWorkspaceBridge(userId)
  const importListeners = new Set<(progress: ImportProgress) => void>()
  const preparationListeners = new Set<(update: PreparationUpdate) => void>()
  const pageListeners = new Set<(progress: DocumentPageParseProgress) => void>()
  const analysisListeners = new Set<(snapshot: DocumentAnalysisSnapshot) => void>()
  const aiListeners = new Set<(event: AiJobEvent) => void>()
  const cancelledJobs = new Set<string>()
  const regenerateTranslations = new Set<string>()
  let activeDocumentId: DocumentId | null = null
  let analysisTimer: number | null = null

  function stopAnalysisPolling(): void {
    if (analysisTimer === null) return
    window.clearInterval(analysisTimer)
    analysisTimer = null
  }
  function startAnalysisPolling(): void {
    if (analysisTimer !== null || analysisListeners.size === 0) return
    analysisTimer = window.setInterval(() => void publishAnalysis(), 2_000)
  }
  async function publishAnalysis(): Promise<void> {
    if (analysisListeners.size === 0 || document.hidden) return
    try {
      const snapshot = await bridge.analysis()
      for (const listener of analysisListeners) listener(snapshot)
      if (hasActiveAnalysis(snapshot)) startAnalysisPolling()
      else stopAnalysisPolling()
    } catch (error) {
      if (!(error instanceof Error)) throw error
    }
  }
  const subscribeAnalysis = (
    listener: (snapshot: DocumentAnalysisSnapshot) => void,
  ): (() => void) => {
    analysisListeners.add(listener)
    return () => {
      analysisListeners.delete(listener)
      if (analysisListeners.size === 0) stopAnalysisPolling()
    }
  }
  async function refreshAfterImport<T>(operation: Promise<T>): Promise<T> {
    const result = await operation
    if (analysisTimer === null) void publishAnalysis()
    return result
  }
  const emitAi = (event: AiJobEvent): void => {
    for (const listener of aiListeners) listener(event)
  }

  const api: OhMyPaperApi = {
    readWorkspace: () => bridge.read(),
    saveWorkspace: async (workspace) => {
      await bridge.save(workspace)
      return workspace
    },
    importDocument: () => refreshAfterImport(bridge.importPicked()),
    importDocumentPath: (token) => refreshAfterImport(bridge.importToken(token)),
    importDocumentPaths: (tokens) =>
      refreshAfterImport(Promise.all(tokens.map((token) => bridge.importToken(token)))),
    getDroppedFilePath: (file) => bridge.rememberDroppedFile(file),
    importDocumentUrl: unavailableWebFeature("document.importUrl"),
    onImportProgress: (listener) => {
      importListeners.add(listener)
      return () => importListeners.delete(listener)
    },
    readDocument: async (id) => {
      activeDocumentId = id
      return bridge.readDocument(id)
    },
    readDocumentLayout: async () => ({ status: "unavailable", reason: "runtime_missing" }),
    parseDocumentPage: async ({ id, pageNumber }) => {
      activeDocumentId = id
      try {
        return { status: "ready", page: await bridge.page(id, pageNumber) }
      } catch (error) {
        if (!(error instanceof Error)) throw error
        return { status: "unavailable", reason: "execution_failed" }
      }
    },
    onDocumentPageParseProgress: (listener) => {
      pageListeners.add(listener)
      return () => pageListeners.delete(listener)
    },
    readDocumentAnalysis: async () => {
      const snapshot = await bridge.analysis()
      if (hasActiveAnalysis(snapshot)) startAnalysisPolling()
      return snapshot
    },
    onDocumentAnalysis: subscribeAnalysis,
    retryDocumentAnalysis: unavailableWebFeature("documentAnalysis.retry"),
    documentOcrStatus: async () => ({
      configured: false,
      provider: "paddle",
      model: "PaddleOCR-VL-1.6",
      acceleration: null,
    }),
    readPageTranslationCache: async ({ id, pageNumber }) => {
      activeDocumentId = id
      const key = `${id}:${pageNumber}`
      const regenerate = regenerateTranslations.delete(key)
      const result = await bridge.translation(id, pageNumber, regenerate)
      const blocks = result.items
        .filter((item) => item.source.trim() && item.translation.trim())
        .map((item) => ({
          id: item.id,
          kind: item.kind === "heading" ? ("heading" as const) : ("body" as const),
          source: item.source,
          translation: item.translation,
          parsedBlockId: item.id,
          sourceBounds: item.bounds,
          sourcePageWidth: result.pageWidth,
          sourcePageHeight: result.pageHeight,
        }))
      return blocks.length > 0 ? { status: "ready", blocks } : { status: "missing" }
    },
    writePageTranslationCache: unavailableWebFeature("pageTranslation.writeCache"),
    clearPageTranslationCache: async ({ id, pageNumber }) => {
      regenerateTranslations.add(`${id}:${pageNumber}`)
    },
    readDocumentAst: async () => ({ status: "failed", reason: "source_unavailable" }),
    onPreparation: (listener) => {
      preparationListeners.add(listener)
      return () => preparationListeners.delete(listener)
    },
    saveApiKey: async (apiKey) => {
      await saveHostedCredential({ provider: "gemini", apiKey, model: GEMINI_WEB_MODEL })
    },
    saveProviderConfig: async (config) => {
      if (config.provider !== "gemini" && config.provider !== "groq")
        throw new WebApiError(400, "unsupported_web_provider")
      if (config.provider === "gemini")
        await saveHostedCredential({
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        })
      else {
        const model = GROQ_WEB_MODELS.find((candidate) => candidate === config.model)
        if (!model) throw new WebApiError(400, "unsupported_groq_model")
        await saveHostedCredential({ provider: config.provider, apiKey: config.apiKey, model })
      }
    },
    providerStatus: async () => {
      const status = await fetchHostedCredentialStatus()
      const provider = status.preferredTextProvider
      const selected = status.providers[provider]
      return {
        configured: selected.source !== "missing",
        provider,
        model: selected.model,
      }
    },
    agentAsk: unavailableWebFeature("agent.ask"),
    agentAskStream: unavailableWebFeature("agent.askStream"),
    runAi: async (request) => {
      activeDocumentId = request.documentId
      return bridge.ai(request.documentId, request)
    },
    streamAi: async (request, onDelta) => {
      activeDocumentId = request.documentId
      const result = await bridge.ai(request.documentId, request)
      onDelta(result.text)
      return result
    },
    startAiJob: async (job) => {
      emitAi({ kind: "started", jobId: job.jobId, sequence: 0 })
      void bridge.ai(job.documentId, job.request).then(
        (result) => {
          if (cancelledJobs.delete(job.jobId)) return
          emitAi({
            kind: "completed",
            jobId: job.jobId,
            sequence: 1,
            usageTokens: 0,
            model: result.model,
            text: result.text,
          })
        },
        (error: unknown) => {
          if (!(error instanceof Error)) throw error
          if (cancelledJobs.delete(job.jobId)) return
          emitAi({
            kind: "failed",
            jobId: job.jobId,
            sequence: 1,
            code: "provider_error",
            retryable: true,
          })
        },
      )
      return { jobId: job.jobId }
    },
    cancelAiJob: async (jobId) => {
      cancelledJobs.add(jobId)
      emitAi({ kind: "cancelled", jobId, sequence: 1 })
    },
    onAiJobEvent: (listener) => {
      aiListeners.add(listener)
      return () => aiListeners.delete(listener)
    },
    lookupCitation: async (request) => {
      if (!activeDocumentId) return { status: "not_found", paper: null, query: request.key }
      return bridge.citation(activeDocumentId, request)
    },
    openExternal: async (request) => {
      const { url } = openExternalRequestSchema.parse(request)
      window.open(url, "_blank", "noopener,noreferrer")
    },
    writeClipboardText: async (text) => {
      await navigator.clipboard.writeText(clipboardWriteTextRequestSchema.parse({ text }).text)
    },
    saveAiMode: unavailableWebFeature("provider.saveAiMode"),
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
    codex: {
      getStatus: async () => ({
        available: false,
        authenticated: false,
        account: null,
        requiresOpenaiAuth: false,
      }),
      listModels: async () => CODEX_MODEL_OPTIONS,
      startLogin: unavailableWebFeature("codex.startLogin"),
      cancelLogin: async () => {},
      logout: async () => {},
      onLoginCompleted: () => () => {},
    },
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
  installedUserId = userId
}
