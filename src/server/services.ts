import { fileURLToPath } from "node:url"
import { lookupCitation } from "../electron/citationService"
import { DocumentAnalysisService } from "../electron/documentAnalysisService"
import { DocumentAstService } from "../electron/documentAstService"
import { createDocumentPageParser } from "../electron/documentPageParser"
import { importDocument, readDocumentBytes } from "../electron/documentService"
import { PaddlePageParserService } from "../electron/paddlePageParserService"
import { PageTranslationCacheService } from "../electron/pageTranslationCacheService"
import { listScholarlyMetadata, saveScholarlyMetadata } from "../electron/scholarlyMetadata"
import { searchScholarly } from "../electron/scholarlySearch"
import { WorkspaceStore } from "../electron/workspaceStore"
import type { AiJobStartRequest } from "../shared/aiIpc"
import {
  type DiscoverySaveInput,
  type DiscoverySaveResult,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
} from "../shared/discoveryIpc"
import type { DocumentOcrProviderStatus } from "../shared/documentOcr"
import { type ProviderConfig, providerConfigSchema } from "../shared/ipc"
import { isOpenRouterModel } from "../shared/providerModels"
import type { DocumentId, Workspace } from "../shared/schemas"
import { createAiJobStreams } from "./aiJobStreams"
import { WebAiService } from "./aiService"
import type { WebServerConfig } from "./config"
import { JevDecisionService } from "./decisionService"
import { LocalCredentialStore } from "./localCredentialStore"

export type WebServices = {
  readonly store: WorkspaceStore
  readonly ast: DocumentAstService
  readonly pages: ReturnType<typeof createDocumentPageParser>
  readonly analysis: DocumentAnalysisService
  readonly translationCache: PageTranslationCacheService
  readonly ocrStatus: () => Promise<DocumentOcrProviderStatus>
  readonly ai: WebAiService
  readonly decisionService: () => JevDecisionService | null
  readonly saveProviderConfig: (config: ProviderConfig) => Promise<void>
  readonly saveDocumentOcrKey: (key: string) => Promise<void>
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
  const environmentOpenRouter =
    config.provider === "openrouter" &&
    config.model &&
    isOpenRouterModel(config.model) &&
    config.apiKeys.openrouter
      ? { provider: "openrouter" as const, apiKey: config.apiKeys.openrouter, model: config.model }
      : null
  const credentials = await LocalCredentialStore.open(config.dataDir, {
    openrouter: environmentOpenRouter,
    mistral: config.mistralApiKey ?? null,
  })
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
  await analysis.resumePending()
  const initialProvider = credentials.openRouterConfig()
  const ai = new WebAiService(initialProvider)
  let decisions = initialProvider ? new JevDecisionService(initialProvider.apiKey) : null
  const jobs = createAiJobStreams(ai)
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
    decisionService: () => decisions,
    saveProviderConfig: async (value) => {
      const parsed = providerConfigSchema.parse(value)
      if (parsed.provider !== "openrouter") throw new Error("OpenRouter is required")
      await credentials.saveOpenRouter(parsed)
      ai.configure(parsed)
      decisions = new JevDecisionService(parsed.apiKey)
    },
    saveDocumentOcrKey: async (key) => credentials.saveMistralApiKey(key),
    startAiJob: jobs.start,
    cancelAiJob: jobs.cancel,
    lookupCitation,
    searchScholarly,
    saveScholarlyMetadata: saveMetadata,
    listSavedScholarlyMetadata: () => listScholarlyMetadata(store.repository),
    close: async () => {
      jobs.dispose()
      await analysis.dispose()
      paddle.dispose()
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
