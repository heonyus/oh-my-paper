import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  type DocumentPageParseProgress,
  type DocumentPageParseResult,
  documentPageParseResultSchema,
  normalizeParsedDocumentPage,
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../shared/documentPageModel"
import type { DocumentId, DocumentRecord, Sha256 } from "../shared/schemas"
import { DocumentAstService } from "./documentAstService"
import type { MistralPageParserService, OcrCredentialSource } from "./mistralPageParserService"
import { buildNativeParsedPage } from "./nativeTextPageParser"
import type { PaddlePageParserService } from "./paddlePageParserService"
import type { WorkspaceStore } from "./workspaceStore"

type PaddlePageParser = Pick<PaddlePageParserService, "parse">

type ActivePageParse = {
  readonly promise: Promise<DocumentPageParseResult>
  readonly controller: AbortController
  consumers: number
}

function waitForAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  let onAbort: (() => void) | undefined
  const aborted = new Promise<T>((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  return Promise.race([promise, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort)
  })
}

export type DocumentPageParserOptions = {
  readonly store: WorkspaceStore
  readonly paddlePageParser: PaddlePageParser
  readonly mistralPageParser: MistralPageParserService
  readonly ocrCredentials: OcrCredentialSource
  readonly astService?: DocumentAstService
}

export class DocumentPageParser {
  readonly #store: WorkspaceStore
  readonly #paddle: PaddlePageParser
  readonly #mistral: MistralPageParserService
  readonly #ocrCredentials: OcrCredentialSource
  readonly #astService: DocumentAstService
  readonly #active = new Map<string, ActivePageParse>()

  constructor(options: DocumentPageParserOptions) {
    this.#store = options.store
    this.#paddle = options.paddlePageParser
    this.#mistral = options.mistralPageParser
    this.#ocrCredentials = options.ocrCredentials
    this.#astService = options.astService ?? new DocumentAstService(options.store)
  }

  async parse(input: {
    readonly documentId: DocumentId
    readonly pageNumber: number
    readonly store?: WorkspaceStore
    readonly onProgress?: (progress: DocumentPageParseProgress) => void
    readonly forceOcr?: boolean
    readonly signal?: AbortSignal | undefined
  }): Promise<DocumentPageParseResult> {
    const key = `${input.documentId}:${input.pageNumber}:${input.forceOcr ? "ocr" : "auto"}`
    let active = this.#active.get(key)
    if (!active) {
      const controller = new AbortController()
      const promise = this.#runParse({ ...input, signal: controller.signal }).finally(() => {
        if (this.#active.get(key)?.promise === promise) this.#active.delete(key)
      })
      active = { promise, controller, consumers: 0 }
      this.#active.set(key, active)
    }
    active.consumers += 1
    try {
      return await waitForAbort(active.promise, input.signal)
    } catch (error) {
      if (input.signal?.aborted) return { status: "unavailable", reason: "execution_failed" }
      throw error
    } finally {
      active.consumers -= 1
      if (active.consumers === 0) {
        active.controller.abort()
        if (this.#active.get(key)?.promise === active.promise) this.#active.delete(key)
      }
    }
  }

  async #runParse(input: {
    readonly documentId: DocumentId
    readonly pageNumber: number
    readonly store?: WorkspaceStore
    readonly onProgress?: (progress: DocumentPageParseProgress) => void
    readonly forceOcr?: boolean
    readonly signal?: AbortSignal | undefined
  }): Promise<DocumentPageParseResult> {
    if (!Number.isInteger(input.pageNumber) || input.pageNumber <= 0) {
      return { status: "unavailable", reason: "invalid_page" }
    }
    const store = input.store ?? this.#store
    const workspace = await store.read()
    const document = workspace.documents.find((doc) => doc.id === input.documentId)
    if (!document) return { status: "unavailable", reason: "unknown_document" }
    if (input.pageNumber > document.pageCount)
      return { status: "unavailable", reason: "invalid_page" }

    const mistralConfigured = (await this.#ocrCredentials.apiKey()) !== null
    if (input.forceOcr || mistralConfigured) {
      const ocrCached = await this.#readOcrCachedPage(store, document.hash, input.pageNumber)
      if (ocrCached)
        return documentPageParseResultSchema.parse({ status: "ready", page: ocrCached })
      return this.#runOcr(input, document, store)
    }

    const cached = await this.#readAnyCachedPage(store, document.hash, input.pageNumber)
    if (cached) return documentPageParseResultSchema.parse({ status: "ready", page: cached })

    const nativeResult = await this.#tryNativeParse(document, input.pageNumber, store)
    if (nativeResult && nativeResult.status === "ready") {
      await this.#writeCachedPage(store, nativeResult.page)
      return nativeResult
    }

    if (nativeResult) return nativeResult
    return {
      status: "unavailable",
      reason: document.quality.needsOcr ? "needs_ocr" : "execution_failed",
    }
  }

  async #runOcr(
    input: {
      readonly documentId: DocumentId
      readonly pageNumber: number
      readonly onProgress?: (progress: DocumentPageParseProgress) => void
      readonly signal?: AbortSignal | undefined
    },
    _document: DocumentRecord,
    store: WorkspaceStore,
  ): Promise<DocumentPageParseResult> {
    const apiKey = await this.#ocrCredentials.apiKey()
    if (apiKey) {
      return this.#mistral.parse({
        documentId: input.documentId,
        pageNumber: input.pageNumber,
        store,
        onProgress: input.onProgress,
        signal: input.signal,
      })
    }
    return this.#paddle.parse({
      documentId: input.documentId,
      pageNumber: input.pageNumber,
      store,
      onProgress: input.onProgress,
    })
  }

  async #tryNativeParse(
    document: DocumentRecord,
    pageNumber: number,
    _store: WorkspaceStore,
  ): Promise<DocumentPageParseResult | null> {
    const astResult = await this.#astService.request({ id: document.id })
    if (astResult.status !== "ready" && astResult.status !== "degraded") return null
    return buildNativeParsedPage({
      ast: astResult.ast,
      pageNumber,
      sourceHash: document.hash,
    })
  }

  async #readAnyCachedPage(
    store: WorkspaceStore,
    hash: Sha256,
    pageNumber: number,
  ): Promise<ParsedDocumentPage | null> {
    const parsers = [
      "mistral-ocr-4-1-blocks-v2",
      "paddleocr-vl-1.6-page-v1",
      "native-text-1.0-page-native-v1",
    ]
    for (const parserDir of parsers) {
      const file = join(store.root, "parsed-pages", hash, parserDir, `page-${pageNumber}.json`)
      try {
        const raw = JSON.parse(await readFile(file, "utf8"))
        const parsed = normalizeParsedDocumentPage(parsedDocumentPageSchema.parse(raw))
        if (parsed.sourceHash === hash && parsed.pageNumber === pageNumber) return parsed
      } catch {
        // ignore and try next
      }
    }
    return null
  }

  async #readOcrCachedPage(
    store: WorkspaceStore,
    hash: Sha256,
    pageNumber: number,
  ): Promise<ParsedDocumentPage | null> {
    const apiKey = await this.#ocrCredentials.apiKey()
    const parserDir = apiKey ? "mistral-ocr-4-1-blocks-v2" : "paddleocr-vl-1.6-page-v1"
    const file = join(store.root, "parsed-pages", hash, parserDir, `page-${pageNumber}.json`)
    try {
      const raw = JSON.parse(await readFile(file, "utf8"))
      const parsed = normalizeParsedDocumentPage(parsedDocumentPageSchema.parse(raw))
      if (parsed.sourceHash === hash && parsed.pageNumber === pageNumber) return parsed
    } catch {
      // ignore and return null
    }
    return null
  }

  async #writeCachedPage(store: WorkspaceStore, page: ParsedDocumentPage): Promise<void> {
    const dirName =
      page.parser === "NativeText-1.0"
        ? "native-text-1.0-page-native-v1"
        : page.parser === "Mistral-OCR-4.1"
          ? "mistral-ocr-4-1-blocks-v2"
          : "paddleocr-vl-1.6-page-v1"
    const file = join(
      store.root,
      "parsed-pages",
      page.sourceHash,
      dirName,
      `page-${page.pageNumber}.json`,
    )
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      await writeFile(tmp, JSON.stringify(page), { encoding: "utf8", mode: 0o600 })
      await rename(tmp, file)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw error
    }
  }
}

export function createDocumentPageParser(options: DocumentPageParserOptions): DocumentPageParser {
  return new DocumentPageParser(options)
}
