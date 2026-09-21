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
import { mergePdfJsAndPaddlePage } from "./hybridPageParser"
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
  readonly astService?: DocumentAstService
}

export class DocumentPageParser {
  readonly #store: WorkspaceStore
  readonly #paddle: PaddlePageParser
  readonly #astService: DocumentAstService
  readonly #active = new Map<string, ActivePageParse>()

  constructor(options: DocumentPageParserOptions) {
    this.#store = options.store
    this.#paddle = options.paddlePageParser
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
    const key = `${input.documentId}:${input.pageNumber}`
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

    const cached = await this.#readCachedPage(store, document.hash, input.pageNumber)
    if (cached) return documentPageParseResultSchema.parse({ status: "ready", page: cached })

    const nativeResult = await this.#tryNativeParse(document, input.pageNumber, store)
    const paddleResult = await this.#paddle.parse({
      documentId: input.documentId,
      pageNumber: input.pageNumber,
      store,
      onProgress: input.onProgress,
    })
    if (paddleResult.status === "ready") {
      if (nativeResult?.status !== "ready") return paddleResult
      const page = mergePdfJsAndPaddlePage(nativeResult.page, paddleResult.page)
      await this.#writeCachedPage(store, page)
      return documentPageParseResultSchema.parse({ status: "ready", page })
    }
    if (nativeResult?.status === "ready") {
      return nativeResult
    }
    return paddleResult
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

  async #readCachedPage(
    store: WorkspaceStore,
    hash: Sha256,
    pageNumber: number,
  ): Promise<ParsedDocumentPage | null> {
    const file = join(
      store.root,
      "parsed-pages",
      hash,
      "pdfjs-paddleocr-vl-1.6-hybrid-v9",
      `page-${pageNumber}.json`,
    )
    try {
      const raw = JSON.parse(await readFile(file, "utf8"))
      const parsed = normalizeParsedDocumentPage(parsedDocumentPageSchema.parse(raw))
      if (parsed.sourceHash === hash && parsed.pageNumber === pageNumber) return parsed
    } catch {
      return null
    }
    return null
  }

  async #writeCachedPage(store: WorkspaceStore, page: ParsedDocumentPage): Promise<void> {
    const file = join(
      store.root,
      "parsed-pages",
      page.sourceHash,
      "pdfjs-paddleocr-vl-1.6-hybrid-v9",
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
