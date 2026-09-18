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

  constructor(
    readonly workspace: WorkspaceStore,
    options: DocumentAstServiceOptions = {},
  ) {
    this.#store = options.store ?? new DocumentAstStore(workspace.root)
    this.#build = options.build ?? preparePdf
  }

  request(request: DocumentAstRequest): Promise<DocumentAstResult> {
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
    const cached = await this.#store.read(document.hash, fingerprint)
    if (cached) return this.#resultForCached(cached, document.hash, fingerprint)
    const activeKey = `${document.hash}:${fingerprint}`
    const active = this.#active.get(activeKey)
    if (active) return active
    const operation = this.#rebuild(document, fingerprint).finally(() =>
      this.#active.delete(activeKey),
    )
    this.#active.set(activeKey, operation)
    return operation
  }

  #resultForCached(
    ast: SourceDocumentAst,
    sourceHash: string,
    fingerprint: string,
  ): DocumentAstResult {
    if (JSON.stringify(ast).length > maximumResponseCharacters)
      return safeFailure("response_too_large")
    return documentAstResultSchema.parse({ status: "ready", sourceHash, fingerprint, ast })
  }

  async #rebuild(document: DocumentRecord, fingerprint: string): Promise<DocumentAstResult> {
    try {
      const bytes = await readFile(await resolveDocumentPath(document.id, this.workspace))
      const prepared = await this.#build(new Uint8Array(bytes), document.name)
      if (prepared.hash !== document.hash || prepared.sourceAst.sourceHash !== document.hash) {
        return safeFailure("stale_source")
      }
      const astSize = JSON.stringify(prepared.sourceAst).length
      if (astSize > maximumResponseCharacters) return safeFailure("response_too_large")
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
