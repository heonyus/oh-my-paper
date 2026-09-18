import { AiJobRegistry, publicAiJobEvent } from "../electron/aiJobRegistry"
import { lookupCitation } from "../electron/citationService"
import { DocumentAstService } from "../electron/documentAstService"
import { createDocumentPageParser } from "../electron/documentPageParser"
import { importDocument, readDocumentBytes } from "../electron/documentService"
import { MistralPageParserService } from "../electron/mistralPageParserService"
import { PageTranslationCacheService } from "../electron/pageTranslationCacheService"
import { searchScholarly } from "../electron/scholarlySearch"
import { WorkspaceStore } from "../electron/workspaceStore"
import type { AiJobStartRequest } from "../shared/aiIpc"
import { MISTRAL_OCR_MODEL } from "../shared/documentOcr"
import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../shared/documentPageModel"
import type { DocumentId, Workspace } from "../shared/schemas"
import { WebAiService } from "./aiService"
import type { WebServerConfig } from "./config"

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
  readonly mistralConfigured: boolean
  readonly ai: WebAiService
  readonly startAiJob: (request: AiJobStartRequest) => AsyncIterable<Uint8Array>
  readonly cancelAiJob: (jobId: AiJobStartRequest["jobId"]) => void
  readonly lookupCitation: typeof lookupCitation
  readonly searchScholarly: typeof searchScholarly
  readonly close: () => Promise<void>
}

export async function createWebServices(config: WebServerConfig): Promise<WebServices> {
  const store = new WorkspaceStore(config.dataDir)
  await store.initialize()
  const ast = new DocumentAstService(store)
  const mistral = new MistralPageParserService({
    apiKey: async () => config.mistralApiKey,
  })
  const pages = createDocumentPageParser({
    store,
    paddlePageParser: noLocalOcrParser,
    mistralPageParser: mistral,
    ocrCredentials: { apiKey: async () => config.mistralApiKey },
    astService: ast,
  })
  const ai = new WebAiService(config)
  const encoder = new TextEncoder()
  const encodeEvent = (event: unknown): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  const registries = new Map<AiJobStartRequest["jobId"], AiJobRegistry>()

  const startAiJob = (request: AiJobStartRequest): AsyncIterable<Uint8Array> => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const registry = new AiJobRegistry((event) => {
          try {
            controller.enqueue(encodeEvent(publicAiJobEvent(event)))
          } catch {
            return
          }
          if (event.kind !== "delta") registries.delete(request.jobId)
        })
        registries.set(request.jobId, registry)
        registry.start({
          id: request.jobId,
          role: request.role,
          run: async (signal, onDelta) => {
            const result = await ai.stream(request.request, onDelta, signal)
            return {
              text: result.text,
              model: result.model,
              inputTokens: null,
              outputTokens: null,
              estimatedCostUsd: null,
            }
          },
        })
      },
      cancel() {
        registries.get(request.jobId)?.cancel(request.jobId)
        registries.delete(request.jobId)
      },
    })
    return {
      async *[Symbol.asyncIterator]() {
        const reader = stream.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done || value === undefined) return
            yield value
          }
        } finally {
          await reader.cancel().catch(() => undefined)
          reader.releaseLock()
        }
      },
    }
  }

  return {
    store,
    ast,
    pages,
    translationCache: new PageTranslationCacheService(store),
    mistralConfigured: config.mistralApiKey !== null,
    ai,
    startAiJob,
    cancelAiJob: (jobId) => {
      registries.get(jobId)?.cancel(jobId)
    },
    lookupCitation,
    searchScholarly,
    close: () => store.close(),
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
    return await importDocument(temporaryPath, services.store)
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
