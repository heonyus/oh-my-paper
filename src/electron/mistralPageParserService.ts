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
  readonly process: (apiKey: string, pdfBase64: string) => Promise<unknown>
}

export type OcrCredentialSource = {
  readonly apiKey: () => Promise<string | null>
}

type ParseInput = {
  readonly documentId: DocumentId
  readonly pageNumber: number
  readonly store: WorkspaceStore
  readonly onProgress?: ((progress: DocumentPageParseProgress) => void) | undefined
}

class HttpMistralOcrTransport implements MistralOcrTransport {
  async process(apiKey: string, pdfBase64: string): Promise<unknown> {
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
      signal: AbortSignal.timeout(180_000),
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
  readonly #active = new Map<string, Promise<void>>()

  constructor(
    readonly credentials: OcrCredentialSource,
    readonly transport: MistralOcrTransport = new HttpMistralOcrTransport(),
  ) {}

  async parse(input: ParseInput): Promise<DocumentPageParseResult> {
    const workspace = await input.store.read()
    const document = workspace.documents.find((candidate) => candidate.id === input.documentId)
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
      this.#parseDocument(document, input.store, apiKey, input.onProgress).finally(() =>
        this.#active.delete(document.hash),
      )
    if (!active) this.#active.set(document.hash, operation)
    try {
      await operation
      const page = await this.#readCachedPage(document, input.pageNumber, input.store)
      return page
        ? documentPageParseResultSchema.parse({ status: "ready", page })
        : { status: "unavailable", reason: "invalid_output" }
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return { status: "unavailable", reason: "invalid_output" }
      if (error instanceof Error) return { status: "unavailable", reason: "execution_failed" }
      throw error
    }
  }

  async #parseDocument(
    document: DocumentRecord,
    store: WorkspaceStore,
    apiKey: string,
    onProgress?: (progress: DocumentPageParseProgress) => void,
  ): Promise<void> {
    onProgress?.({ id: document.id, pageNumber: 1, stage: "engine-starting" })
    const pdfPath = await resolveDocumentPath(document.id, store)
    onProgress?.({ id: document.id, pageNumber: 1, stage: "page-rendering" })
    const pdfBase64 = (await readFile(pdfPath)).toString("base64")
    onProgress?.({ id: document.id, pageNumber: 1, stage: "document-analyzing" })
    const pages = parsedPagesFromMistralResponse(
      await this.transport.process(apiKey, pdfBase64),
      document.hash,
    )
    if (pages.length !== document.pageCount) throw new MistralOcrRequestError(422)
    onProgress?.({ id: document.id, pageNumber: 1, stage: "finalizing" })
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
      "mistral-ocr-4-1-blocks-v1",
      `page-${pageNumber}.json`,
    )
  }
}
