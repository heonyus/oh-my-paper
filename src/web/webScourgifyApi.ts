import type { AiJobEvent } from "../shared/aiIpc"
import type { DocumentAnalysisSnapshot } from "../shared/documentAnalysis"
import { MISTRAL_OCR_MODEL } from "../shared/documentOcr"
import type { DocumentPageParseProgress } from "../shared/documentPageModel"
import {
  clipboardWriteTextRequestSchema,
  type ImportProgress,
  openExternalRequestSchema,
  type PreparationUpdate,
  type ScourgifyApi,
} from "../shared/ipc"
import type { DocumentId } from "../shared/schemas"
import { GEMINI_WEB_MODEL, GROQ_WEB_MODELS, MISTRAL_WEB_MODEL } from "../shared/webCredentials"
import { fetchHostedCredentialStatus, saveHostedCredential, WebApiError } from "./api"
import { WebWorkspaceBridge } from "./webWorkspace"

let installedUserId: string | null = null

export function installWebScourgifyApi(userId: string): void {
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

  function hasActiveAnalysis(snapshot: DocumentAnalysisSnapshot): boolean {
    return snapshot.some((job) => job.state === "queued" || job.state === "running")
  }
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

  const api: ScourgifyApi = {
    readWorkspace: () => bridge.read(),
    saveWorkspace: async (workspace) => bridge.save(workspace),
    importDocument: () => refreshAfterImport(bridge.importPicked()),
    importDocumentPath: (token) => refreshAfterImport(bridge.importToken(token)),
    importDocumentPaths: (tokens) =>
      refreshAfterImport(Promise.all(tokens.map((token) => bridge.importToken(token)))),
    getDroppedFilePath: (file) => bridge.rememberDroppedFile(file),
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
    saveDocumentOcrKey: async (apiKey) => {
      await saveHostedCredential({ provider: "mistral", apiKey, model: MISTRAL_WEB_MODEL })
    },
    documentOcrStatus: async () => {
      const status = await fetchHostedCredentialStatus()
      return {
        configured: status.providers.mistral.source !== "missing",
        provider: "mistral",
        model: MISTRAL_OCR_MODEL,
      }
    },
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
    writePageTranslationCache: async () => {},
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
  }
  Object.defineProperty(window, "scourgify", { value: api, configurable: true })
  installedUserId = userId
}
