import { readFile } from "node:fs/promises"
import type { SourceDocumentAst } from "../shared/documentAst"
import type { DocumentAstRequest, DocumentAstResult } from "../shared/documentAstIpc"
import { documentAstResultSchema } from "../shared/documentAstIpc"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import { createAstFingerprint, DocumentAstStore, DocumentAstStoreError } from "./documentAstStore"
import { resolveDocumentPath } from "./documentService"
import type { PreparedPdf } from "./preparePdf"
import { preparePdf } from "./preparePdf"
import type { WorkspaceStore } from "./workspaceStore"

const extractorVersion = "pdfjs-6-source-1"
const astConfigVersion = "source-only-v1"
const maximumResponseCharacters = 8_000_000

type AstBuilder = (bytes: Uint8Array, fileName: string) => Promise<PreparedPdf>

export type DocumentAstServiceOptions = {
  readonly build?: AstBuilder
  readonly store?: DocumentAstStore
}

function findDocument(
  documents: readonly DocumentRecord[],
  id: DocumentId,
): DocumentRecord | undefined {
  return documents.find((candidate) => candidate.id === id)
}

function safeFailure(
  reason: Extract<DocumentAstResult, { readonly status: "failed" }>["reason"],
): DocumentAstResult {
  return documentAstResultSchema.parse({ status: "failed", reason })
}

function sourceDocument(
  document: DocumentRecord,
  workspaceDocuments: readonly DocumentRecord[],
): DocumentRecord | null {
  const current = findDocument(workspaceDocuments, document.id)
  return current?.hash === document.hash ? current : null
}

export class DocumentAstService {
  readonly #store: DocumentAstStore
  readonly #build: AstBuilder
  readonly #active = new Map<string, Promise<DocumentAstResult>>()
  /**
   * The last documents' ASTs, kept parsed: the page parser asks for one on every page, and a
   * long paper's AST takes seconds to read and validate.
   */
  readonly #recent = new Map<string, DocumentAstResult>()
  readonly #sizes = new WeakMap<SourceDocumentAst, number>()

  constructor(
    readonly workspace: WorkspaceStore,
    options: DocumentAstServiceOptions = {},
  ) {
    this.#store = options.store ?? new DocumentAstStore(workspace.root)
    this.#build = options.build ?? preparePdf
  }

  /** The AST for the renderer: refused when too large to send over IPC. */
  async request(request: DocumentAstRequest): Promise<DocumentAstResult> {
    const result = await this.#loadDocument(request)
    if (result.status !== "ready" && result.status !== "degraded") return result
    const size = this.#sizes.get(result.ast) ?? JSON.stringify(result.ast).length
    this.#sizes.set(result.ast, size)
    return size > maximumResponseCharacters ? safeFailure("response_too_large") : result
  }

  /**
   * The AST for use in this process, as the page parser reads it: a long paper's AST can
   * outgrow what IPC carries, but nothing here needs to send it anywhere.
   */
  read(request: DocumentAstRequest): Promise<DocumentAstResult> {
    return this.#loadDocument(request)
  }

  async #loadDocument(request: DocumentAstRequest): Promise<DocumentAstResult> {
    const workspace = await this.workspace.read()
    const document = findDocument(workspace.documents, request.id)
    if (!document) return safeFailure("unknown_document")
    if (request.sourceHash && request.sourceHash !== document.hash)
      return safeFailure("stale_source")
    const fingerprint = createAstFingerprint({
      sourceHash: document.hash,
      extractorVersion,
      configVersion: astConfigVersion,
    })
    if (request.fingerprint && request.fingerprint !== fingerprint)
      return safeFailure("stale_source")
    const key = `${document.hash}:${fingerprint}`
    const recent = this.#recent.get(key)
    if (recent) return recent
    const active = this.#active.get(key)
    if (active) return active
    const operation = this.#storedOrRebuilt(document, fingerprint)
      .then((result) => {
        if (result.status === "ready") this.#remember(key, result)
        return result
      })
      .finally(() => this.#active.delete(key))
    this.#active.set(key, operation)
    return operation
  }

  async #storedOrRebuilt(
    document: DocumentRecord,
    fingerprint: string,
  ): Promise<DocumentAstResult> {
    const cached = await this.#store.read(document.hash, fingerprint)
    if (cached) return this.#resultForCached(cached, document.hash, fingerprint)
    return this.#rebuild(document, fingerprint)
  }

  #remember(key: string, result: DocumentAstResult): void {
    this.#recent.delete(key)
    this.#recent.set(key, result)
    for (const oldest of this.#recent.keys()) {
      if (this.#recent.size <= 2) break
      this.#recent.delete(oldest)
    }
  }

  #resultForCached(
    ast: SourceDocumentAst,
    sourceHash: string,
    fingerprint: string,
  ): DocumentAstResult {
    return documentAstResultSchema.parse({ status: "ready", sourceHash, fingerprint, ast })
  }

  async #rebuild(document: DocumentRecord, fingerprint: string): Promise<DocumentAstResult> {
    try {
      const bytes = await readFile(await resolveDocumentPath(document.id, this.workspace))
      const prepared = await this.#build(new Uint8Array(bytes), document.name)
      if (prepared.hash !== document.hash || prepared.sourceAst.sourceHash !== document.hash) {
        return safeFailure("stale_source")
      }
      try {
        await this.#store.write(prepared.sourceAst, fingerprint)
      } catch (error) {
        if (!(error instanceof DocumentAstStoreError)) throw error
        return documentAstResultSchema.parse({
          status: "degraded",
          sourceHash: document.hash,
          fingerprint,
          ast: prepared.sourceAst,
          reason: "sidecar_unavailable",
        })
      }
      const current = sourceDocument(document, (await this.workspace.read()).documents)
      return current
        ? this.#resultForCached(prepared.sourceAst, document.hash, fingerprint)
        : safeFailure("stale_source")
    } catch (error) {
      if (error instanceof Error) return safeFailure("source_unavailable")
      throw error
    }
  }
}
