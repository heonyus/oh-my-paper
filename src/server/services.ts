import { fileURLToPath } from "node:url"
import type { z } from "zod"
import { type AgentStepListener, askAgent } from "../electron/agentService"
import { lookupCitation } from "../electron/citationService"
import { createClaudeWebSearchEngine } from "../electron/claudeWebSearch"
import { DocumentAnalysisService } from "../electron/documentAnalysisService"
import { DocumentAstService } from "../electron/documentAstService"
import { createDocumentPageParser } from "../electron/documentPageParser"
import { importDocument, readDocumentBytes } from "../electron/documentService"
import { PaddlePageParserService } from "../electron/paddlePageParserService"
import { PageTranslationCacheService } from "../electron/pageTranslationCacheService"
import { createPaperDiscoverySources } from "../electron/paperDiscoverySources"
import { listScholarlyMetadata, saveScholarlyMetadata } from "../electron/scholarlyMetadata"
import { searchScholarly } from "../electron/scholarlySearch"
import { WorkspaceStore } from "../electron/workspaceStore"
import {
  AGENT_CONTEXT_EXCERPT_CHARACTERS,
  type AgentAskRequest,
  type AgentAskResult,
  type AgentContextDoc,
} from "../shared/agentChat"
import type { AiJobStartRequest } from "../shared/aiIpc"
import {
  type DiscoverySaveInput,
  type DiscoverySaveResult,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
} from "../shared/discoveryIpc"
import type { DocumentOcrProviderStatus } from "../shared/documentOcr"
import {
  type aiModeRequestSchema,
  type ProviderConfig,
  type ProviderStatus,
  providerConfigSchema,
} from "../shared/ipc"
import type { DocumentId, Workspace } from "../shared/schemas"
import { createAiJobStreams } from "./aiJobStreams"
import { createAiModeServices } from "./aiModeServices"
import type { WebServerConfig } from "./config"
import { JevDecisionService } from "./decisionService"
import { scheduleDerivedCacheCleanup } from "./derivedCacheCleanupTask"
import { deleteLibraryDocument } from "./documentDeletion"
import { MeaningSearchService } from "./meaningSearchService"
import { claudeModelOf } from "./subscriptionAi"
import { createWebAiRuntime } from "./webAiRuntime"

export type WebServices = {
  readonly store: WorkspaceStore
  readonly ast: DocumentAstService
  readonly pages: ReturnType<typeof createDocumentPageParser>
  readonly analysis: DocumentAnalysisService
  readonly translationCache: PageTranslationCacheService
  readonly ocrStatus: () => Promise<DocumentOcrProviderStatus>
  readonly ai: Awaited<ReturnType<typeof createWebAiRuntime>>["ai"]
  readonly subscription: Awaited<ReturnType<typeof createWebAiRuntime>>["subscription"]
  readonly claude: Awaited<ReturnType<typeof createWebAiRuntime>>["claude"]
  readonly agentAsk: (
    input: AgentAskRequest,
    onStep?: AgentStepListener,
    signal?: AbortSignal,
  ) => Promise<AgentAskResult>
  readonly decisionService: () => JevDecisionService | null
  readonly meaningSearch: MeaningSearchService
  readonly saveProviderConfig: (config: ProviderConfig) => Promise<void>
  readonly deleteDocument: (id: DocumentId) => Promise<boolean>
  readonly saveAiMode: (input: z.infer<typeof aiModeRequestSchema>) => Promise<void>
  readonly providerStatus: () => Promise<ProviderStatus>
  readonly startAiJob: (request: AiJobStartRequest) => AsyncIterable<Uint8Array>
  readonly cancelAiJob: (jobId: AiJobStartRequest["jobId"]) => void
  readonly lookupCitation: typeof lookupCitation
  readonly searchScholarly: typeof searchScholarly
  readonly saveScholarlyMetadata: (input: DiscoverySaveInput) => Promise<DiscoverySaveResult>
  readonly listSavedScholarlyMetadata: () => ReturnType<typeof listScholarlyMetadata>
  readonly close: () => Promise<void>
}

export async function createWebServices(config: WebServerConfig): Promise<WebServices> {
  const store = new WorkspaceStore(config.dataDir)
  await store.initialize()
  const runtime = await createWebAiRuntime(config)
  const { credentials, subscription, claude, aiModes, initialProvider, ai } = runtime
  const aiModeServices = createAiModeServices({ ai, aiModes, subscription, claude })
  const ast = new DocumentAstService(store)
  const sourceRoot = fileURLToPath(new URL("../..", import.meta.url))
  const paddle = new PaddlePageParserService({
    appPath: sourceRoot,
    resourcesPath: sourceRoot,
    packaged: false,
  })
  const pages = createDocumentPageParser({
    store,
    paddlePageParser: paddle,
    astService: ast,
  })
  const analysis = new DocumentAnalysisService(store, pages, { maxConcurrency: 4 })
  // The server listens while the library's unanalysed papers are queued in the background.
  const resuming = analysis.resumePending().catch((error: unknown) => {
    console.warn("[document-analysis] could not resume the analysis queue", error)
  })
  const cacheCleanup = scheduleDerivedCacheCleanup(store)
  let decisions =
    initialProvider?.provider === "openrouter"
      ? new JevDecisionService(initialProvider.apiKey)
      : null
  const meaningSearch = new MeaningSearchService(config.dataDir)
  const jobs = createAiJobStreams(ai)
  const paperSources = createPaperDiscoverySources()
  // In Claude subscription mode the CLI's own WebSearch backs a once-per-turn web fallback.
  const paperSourcesWithWeb = createPaperDiscoverySources(process.env, {
    fallbackEngine: createClaudeWebSearchEngine({
      claude,
      settings: () => ({ model: claudeModelOf(ai.modeSettings()), effort: "low" }),
    }),
  })
  const discoverySources = async () => {
    if (ai.modeSettings().mode !== "claude" || !claude.isAvailable) return paperSources
    return (await claude.getStatus()).authenticated ? paperSourcesWithWeb : paperSources
  }
  let metadataSaveQueue: Promise<void> = Promise.resolve()
  const saveMetadata = async (input: DiscoverySaveInput): Promise<DiscoverySaveResult> => {
    const parsed = discoverySaveInputSchema.parse(input)
    const operation = metadataSaveQueue.then(() =>
      discoverySaveResultSchema.parse(saveScholarlyMetadata(store.repository, parsed.item)),
    )
    metadataSaveQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  return {
    store,
    ast,
    pages,
    analysis,
    translationCache: new PageTranslationCacheService(store),
    ocrStatus: () => paddle.status(),
    ai,
    subscription,
    claude,
    agentAsk: async (input, onStep, signal): Promise<AgentAskResult> =>
      askAgent(
        input,
        {
          sources: await discoverySources(),
          complete: (messages, options) => ai.chat(messages, options),
          contextDocs: async (ids): Promise<readonly AgentContextDoc[]> => {
            const documents = await Promise.all(
              [...new Set(ids)].map((id) => store.findDocument(id)),
            )
            return documents
              .filter((document) => document !== null)
              .map((document) => ({
                documentId: document.id,
                title: document.title,
                authors: document.authors,
                year: document.year,
                excerpt: document.overview.slice(0, AGENT_CONTEXT_EXCERPT_CHARACTERS),
              }))
          },
        },
        onStep,
        signal,
      ),
    decisionService: () => decisions,
    meaningSearch,
    deleteDocument: (id) => deleteLibraryDocument({ store, analysis, paddle }, id),
    saveProviderConfig: async (value) => {
      const parsed = providerConfigSchema.parse(value)
      await credentials.saveApiConfig(parsed)
      ai.configure(parsed)
      const nextMode = { ...ai.modeSettings(), mode: "api" as const }
      await aiModes.save(nextMode)
      ai.configureMode(nextMode)
      decisions = parsed.provider === "openrouter" ? new JevDecisionService(parsed.apiKey) : null
    },
    saveAiMode: aiModeServices.saveAiMode,
    providerStatus: aiModeServices.providerStatus,
    startAiJob: jobs.start,
    cancelAiJob: jobs.cancel,
    lookupCitation,
    searchScholarly,
    saveScholarlyMetadata: saveMetadata,
    listSavedScholarlyMetadata: () => listScholarlyMetadata(store.repository),
    close: async () => {
      jobs.dispose()
      await cacheCleanup.stop()
      await analysis.dispose()
      await resuming
      paddle.dispose()
      subscription.dispose()
      claude.dispose()
      await store.close()
    },
  }
}

export async function importPdfBytes(
  bytes: Uint8Array,
  fileName: string,
  services: WebServices,
): Promise<Awaited<ReturnType<typeof importDocument>>> {
  const { mkdir, rm, writeFile } = await import("node:fs/promises")
  const uploadDir = `${services.store.root}/.uploads`
  await mkdir(uploadDir, { recursive: true })
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const temporaryPath = `${uploadDir}/${Date.now()}-${safeName}`
  await writeFile(temporaryPath, bytes, { mode: 0o600 })
  try {
    const result = await importDocument(temporaryPath, services.store, fileName)
    if (result) await services.analysis.schedule(result.document.id)
    return result
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export async function importPdfFromUrl(
  url: string,
  services: WebServices,
): Promise<Awaited<ReturnType<typeof importDocument>>> {
  const { downloadRemotePdf } = await import("../shared/remotePdf")
  const { bytes, fileName } = await downloadRemotePdf(url)
  return importPdfBytes(bytes, fileName, services)
}

export async function readDocumentBase64(id: DocumentId, services: WebServices): Promise<string> {
  return (await readDocumentBytes(id, services.store)).toString("base64")
}

export async function readWorkspace(services: WebServices): Promise<Workspace> {
  return services.store.read()
}
