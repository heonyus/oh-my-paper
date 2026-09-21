import { lookupCitation } from "../electron/citationService"
import { DocumentAstService } from "../electron/documentAstService"
import { createDocumentPageParser } from "../electron/documentPageParser"
import { importDocument, readDocumentBytes } from "../electron/documentService"
import { MistralPageParserService } from "../electron/mistralPageParserService"
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
import { MISTRAL_OCR_MODEL } from "../shared/documentOcr"
import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../shared/documentPageModel"
import { type ProviderConfig, providerConfigSchema } from "../shared/ipc"
import { isOpenRouterModel } from "../shared/providerModels"
import type { DocumentId, Workspace } from "../shared/schemas"
import { createAiJobStreams } from "./aiJobStreams"
import { WebAiService } from "./aiService"
import type { WebServerConfig } from "./config"
import { JevDecisionService } from "./decisionService"
import { LocalCredentialStore } from "./localCredentialStore"

type PageParserInput = {
  readonly documentId: DocumentId
  readonly pageNumber: number
  readonly store: WorkspaceStore
  readonly onProgress?: (progress: DocumentPageParseProgress) => void
}

const noLocalOcrParser = {
  parse: async (_input: PageParserInput): Promise<DocumentPageParseResult> => ({
    status: "unavailable",
    reason: "runtime_missing",
  }),
}

export type WebServices = {
  readonly store: WorkspaceStore
  readonly ast: DocumentAstService
  readonly pages: ReturnType<typeof createDocumentPageParser>
  readonly translationCache: PageTranslationCacheService
  readonly mistralConfigured: () => boolean
  readonly ai: WebAiService
  readonly decisionService: () => JevDecisionService | null
  readonly saveProviderConfig: (config: ProviderConfig) => Promise<void>
  readonly saveMistralKey: (key: string) => Promise<void>
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
    mistralApiKey: config.mistralApiKey,
  })
  const ast = new DocumentAstService(store)
  const mistral = new MistralPageParserService({
    apiKey: async () => credentials.mistralKey(),
  })
  const pages = createDocumentPageParser({
    store,
    paddlePageParser: noLocalOcrParser,
    mistralPageParser: mistral,
    ocrCredentials: { apiKey: async () => credentials.mistralKey() },
    astService: ast,
  })
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
    translationCache: new PageTranslationCacheService(store),
    mistralConfigured: () => credentials.mistralKey() !== null,
    ai,
    decisionService: () => decisions,
    saveProviderConfig: async (value) => {
      const parsed = providerConfigSchema.parse(value)
      if (parsed.provider !== "openrouter") throw new Error("OpenRouter is required")
      await credentials.saveOpenRouter(parsed)
      ai.configure(parsed)
      decisions = new JevDecisionService(parsed.apiKey)
    },
    saveMistralKey: async (key) => credentials.saveMistral(key),
    startAiJob: jobs.start,
    cancelAiJob: jobs.cancel,
    lookupCitation,
    searchScholarly,
    saveScholarlyMetadata: saveMetadata,
    listSavedScholarlyMetadata: () => listScholarlyMetadata(store.repository),
    close: async () => {
      jobs.dispose()
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
    return await importDocument(temporaryPath, services.store, fileName)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export async function readDocumentBase64(id: DocumentId, services: WebServices): Promise<string> {
  return (await readDocumentBytes(id, services.store)).toString("base64")
}

export async function readWorkspace(services: WebServices): Promise<Workspace> {
  return services.store.read()
}

export { MISTRAL_OCR_MODEL }
