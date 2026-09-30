import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { request } from "undici"
import { z } from "zod"
import { MISTRAL_OCR_MODEL } from "../shared/documentOcr"
import {
  type DocumentPageParseProgress,
  type DocumentPageParseResult,
  documentPageParseResultSchema,
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../shared/documentPageModel"
import type { DocumentId, DocumentRecord, Sha256 } from "../shared/schemas"
import { resolveDocumentPath } from "./documentService"
import { parsedPagesFromMistralResponse } from "./mistralOcrResponse"
import type { WorkspaceStore } from "./workspaceStore"

export type MistralOcrTransport = {
  readonly process: (apiKey: string, pdfBase64: string, signal?: AbortSignal) => Promise<unknown>
}

export type OcrCredentialSource = {
  readonly apiKey: () => Promise<string | null>
}

type ParseInput = {
  readonly documentId: DocumentId
  readonly pageNumber: number
  readonly store: WorkspaceStore
  readonly onProgress?: ((progress: DocumentPageParseProgress) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

type ActiveOperation = {
  readonly promise: Promise<void>
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

class HttpMistralOcrTransport implements MistralOcrTransport {
  async process(apiKey: string, pdfBase64: string, signal?: AbortSignal): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(180_000)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    const response = await request("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MISTRAL_OCR_MODEL,
        document: {
          type: "document_url",
          document_url: `data:application/pdf;base64,${pdfBase64}`,
        },
        include_blocks: true,
        include_image_base64: false,
        confidence_scores_granularity: "block",
        extract_header: true,
        extract_footer: true,
        table_format: "markdown",
      }),
      signal: requestSignal,
    })
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new MistralOcrRequestError(response.statusCode)
    return response.body.json()
  }
}

export class MistralOcrRequestError extends Error {
  readonly name = "MistralOcrRequestError"

  constructor(readonly statusCode: number) {
    super(`Mistral OCR request failed with status ${statusCode}`)
  }
}

export class MistralPageParserService {
  readonly #active = new Map<string, ActiveOperation>()

  constructor(
    readonly credentials: OcrCredentialSource,
    readonly transport: MistralOcrTransport = new HttpMistralOcrTransport(),
  ) {}

  async parse(input: ParseInput): Promise<DocumentPageParseResult> {
    if (input.signal?.aborted) return { status: "unavailable", reason: "execution_failed" }
    const document = await input.store.findDocument(input.documentId)
    if (!document) return { status: "unavailable", reason: "unknown_document" }
    if (input.pageNumber > document.pageCount)
      return { status: "unavailable", reason: "invalid_page" }
    const cached = await this.#readCachedPage(document, input.pageNumber, input.store)
    if (cached) return documentPageParseResultSchema.parse({ status: "ready", page: cached })
    const apiKey = await this.credentials.apiKey()
    if (!apiKey) return { status: "unavailable", reason: "provider_unconfigured" }
    const active = this.#active.get(document.hash)
    const operation =
      active ??
      this.#startOperation(document, input.store, apiKey, input.pageNumber, input.onProgress)
    if (!active) this.#active.set(document.hash, operation)
    operation.consumers += 1
    try {
      await waitForAbort(operation.promise, input.signal)
      const page = await this.#readCachedPage(document, input.pageNumber, input.store)
      return page
        ? documentPageParseResultSchema.parse({ status: "ready", page })
        : { status: "unavailable", reason: "invalid_output" }
    } catch (error) {
      if (input.signal?.aborted) return { status: "unavailable", reason: "execution_failed" }
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return { status: "unavailable", reason: "invalid_output" }
      if (error instanceof Error) return { status: "unavailable", reason: "execution_failed" }
      throw error
    } finally {
      operation.consumers -= 1
      if (operation.consumers === 0) operation.controller.abort()
    }
  }

  #startOperation(
    document: DocumentRecord,
    store: WorkspaceStore,
    apiKey: string,
    requestedPageNumber: number,
    onProgress?: (progress: DocumentPageParseProgress) => void,
  ): ActiveOperation {
    const controller = new AbortController()
    const operationPromise = this.#parseDocument(
      document,
      store,
      apiKey,
      requestedPageNumber,
      onProgress,
      controller.signal,
    ).finally(() => {
      const active = this.#active.get(document.hash)
      if (active?.promise === operationPromise) this.#active.delete(document.hash)
    })
    return { promise: operationPromise, controller, consumers: 0 }
  }

  async #parseDocument(
    document: DocumentRecord,
    store: WorkspaceStore,
    apiKey: string,
    requestedPageNumber: number,
    onProgress?: (progress: DocumentPageParseProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    onProgress?.({ id: document.id, pageNumber: requestedPageNumber, stage: "engine-starting" })
    const pdfPath = await resolveDocumentPath(document.id, store)
    onProgress?.({ id: document.id, pageNumber: requestedPageNumber, stage: "page-rendering" })
    const pdfBase64 = (await readFile(pdfPath, { signal })).toString("base64")
    onProgress?.({ id: document.id, pageNumber: requestedPageNumber, stage: "document-analyzing" })
    const pages = parsedPagesFromMistralResponse(
      await this.transport.process(apiKey, pdfBase64, signal),
      document.hash,
    )
    if (pages.length !== document.pageCount) throw new MistralOcrRequestError(422)
    onProgress?.({ id: document.id, pageNumber: requestedPageNumber, stage: "finalizing" })
    await Promise.all(pages.map((page) => this.#writePage(page, store)))
  }

  async #readCachedPage(
    document: DocumentRecord,
    pageNumber: number,
    store: WorkspaceStore,
  ): Promise<ParsedDocumentPage | null> {
    try {
      return parsedDocumentPageSchema.parse(
        JSON.parse(await readFile(this.#cacheFile(store, document.hash, pageNumber), "utf8")),
      )
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        error instanceof z.ZodError ||
        (error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        return null
      throw error
    }
  }

  async #writePage(page: ParsedDocumentPage, store: WorkspaceStore): Promise<void> {
    const file = this.#cacheFile(store, page.sourceHash, page.pageNumber)
    const temporary = `${file}.tmp`
    await mkdir(dirname(file), { recursive: true })
    await writeFile(temporary, JSON.stringify(page), { encoding: "utf8", mode: 0o600 })
    await rename(temporary, file)
  }

  #cacheFile(store: WorkspaceStore, hash: Sha256, pageNumber: number): string {
    return join(
      store.root,
      "parsed-pages",
      hash,
      "mistral-ocr-4-1-blocks-v2",
      `page-${pageNumber}.json`,
    )
  }
}
