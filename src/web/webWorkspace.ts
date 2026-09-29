import type { AiRequest } from "../shared/aiIpc"
import {
  type DocumentAnalysisSnapshot,
  documentAnalysisJobSchema,
  snapshotOfAnalysisJobs,
} from "../shared/documentAnalysis"
import type { ParsedDocumentPage } from "../shared/documentPageModel"
import type { CitationLookupRequest, CitationLookupResult, ImportResult } from "../shared/ipc"
import {
  type DocumentId,
  type DocumentRecord,
  documentIdSchema,
  documentRecordSchema,
  type Workspace,
  workspaceSchema,
} from "../shared/schemas"
import {
  fetchDocumentBytes,
  fetchDocumentPage,
  fetchDocuments,
  lookupWebCitation,
  runDocumentAi,
  translateDocumentPage,
  uploadPdf,
  type WebAiResult,
  WebApiError,
  type WebDocument,
  type WebPageTranslation,
} from "./api"

function emptyWorkspace(): Workspace {
  return workspaceSchema.parse({
    documents: [],
    cards: [],
    sidebarOpen: true,
    viewport: { x: 88, y: 36, zoom: 0.9 },
    activeDocumentId: null,
  })
}

function localDocumentId(document: WebDocument): DocumentId {
  return documentIdSchema.parse(document.sourceHash.slice(0, 16))
}

function recordFromWeb(
  document: WebDocument,
  previous?: DocumentRecord,
  bytes = previous?.bytes ?? 1,
): DocumentRecord {
  return documentRecordSchema.parse({
    id: localDocumentId(document),
    name: document.name,
    hash: document.sourceHash,
    bytes,
    importedAt: document.createdAt,
    pageCount: document.pageCount > 0 ? document.pageCount : (previous?.pageCount ?? 1),
    title: previous?.title ?? document.name.replace(/\.pdf$/iu, ""),
    authors: previous?.authors ?? [],
    year: previous?.year ?? null,
    doi: previous?.doi ?? null,
    kind: previous?.kind ?? "document",
    overview: previous?.overview ?? "",
    quality: previous?.quality ?? {
      textCharacters: 0,
      needsOcr: document.status !== "ready",
      warnings: [],
    },
  })
}

function pdfPicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/pdf,.pdf"
    input.addEventListener("change", () => resolve(input.files?.item(0) ?? null), { once: true })
    input.click()
  })
}

function base64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  return btoa(binary)
}

export class WebWorkspaceBridge {
  readonly #storageKey: string
  readonly #remoteIds = new Map<DocumentId, string>()
  readonly #droppedFiles = new Map<string, File>()

  constructor(userId: string) {
    this.#storageKey = `ohmypaper-web-workspace:${userId}`
  }

  #remember(documents: readonly WebDocument[]): void {
    for (const document of documents) this.#remoteIds.set(localDocumentId(document), document.id)
  }

  #persisted(): Workspace {
    const serialized = localStorage.getItem(this.#storageKey)
    if (!serialized) return emptyWorkspace()
    try {
      const parsed = workspaceSchema.safeParse(JSON.parse(serialized))
      return parsed.success ? parsed.data : emptyWorkspace()
    } catch (error) {
      if (error instanceof SyntaxError) return emptyWorkspace()
      throw error
    }
  }

  async read(): Promise<Workspace> {
    const remote = await fetchDocuments()
    this.#remember(remote)
    const persisted = this.#persisted()
    const previous = new Map(persisted.documents.map((document) => [document.id, document]))
    const documents = remote.map((document) =>
      recordFromWeb(document, previous.get(localDocumentId(document))),
    )
    const available = new Set(documents.map((document) => document.id))
    return workspaceSchema.parse({
      ...persisted,
      documents,
      activeDocumentId:
        persisted.activeDocumentId && available.has(persisted.activeDocumentId)
          ? persisted.activeDocumentId
          : null,
    })
  }

  save(workspace: Workspace): void {
    localStorage.setItem(this.#storageKey, JSON.stringify(workspaceSchema.parse(workspace)))
  }

  rememberDroppedFile(file: File): string {
    const token = `web-file:${crypto.randomUUID()}`
    this.#droppedFiles.set(token, file)
    return token
  }

  async importPicked(): Promise<ImportResult> {
    const file = await pdfPicker()
    return file ? this.importFile(file) : null
  }

  async importToken(token: string): Promise<ImportResult> {
    const file = this.#droppedFiles.get(token)
    if (!file) return null
    this.#droppedFiles.delete(token)
    return this.importFile(file)
  }

  async importFile(file: File): Promise<ImportResult> {
    const uploaded = await uploadPdf(file)
    this.#remember([uploaded])
    return { document: recordFromWeb(uploaded, undefined, file.size), duplicate: false }
  }

  async #remoteId(id: DocumentId): Promise<string> {
    const known = this.#remoteIds.get(id)
    if (known) return known
    const documents = await fetchDocuments()
    this.#remember(documents)
    const resolved = this.#remoteIds.get(id)
    if (!resolved) throw new WebApiError(404, "document_unavailable")
    return resolved
  }

  async readDocument(id: DocumentId): Promise<string> {
    return base64(await fetchDocumentBytes(await this.#remoteId(id)))
  }

  async page(id: DocumentId, pageNumber: number): Promise<ParsedDocumentPage> {
    return fetchDocumentPage(await this.#remoteId(id), pageNumber)
  }

  async translation(
    id: DocumentId,
    pageNumber: number,
    regenerate: boolean,
  ): Promise<WebPageTranslation> {
    return translateDocumentPage(await this.#remoteId(id), pageNumber, regenerate)
  }

  async ai(id: DocumentId, request: AiRequest): Promise<WebAiResult> {
    return runDocumentAi(await this.#remoteId(id), request)
  }

  async citation(id: DocumentId, request: CitationLookupRequest): Promise<CitationLookupResult> {
    return lookupWebCitation(await this.#remoteId(id), request)
  }

  async analysis(): Promise<DocumentAnalysisSnapshot> {
    const documents = await fetchDocuments()
    this.#remember(documents)
    return snapshotOfAnalysisJobs(
      documents
        .filter((document) => document.status !== "ready")
        .map((document) => {
          const base = {
            id: localDocumentId(document),
            title: document.name,
            pageCount: Math.max(1, document.pageCount),
            completedPages: 0,
          }
          if (document.status === "queued")
            return documentAnalysisJobSchema.parse({ ...base, state: "queued" })
          if (document.status === "analyzing")
            return documentAnalysisJobSchema.parse({
              ...base,
              state: "running",
              currentPage: 1,
              stage: "document-analyzing",
              engine: "local",
              attempt: 1,
              maxAttempts: 2,
            })
          return documentAnalysisJobSchema.parse({
            ...base,
            state: "failed",
            message: "문서 구조 분석에 실패했습니다.",
          })
        }),
    )
  }
}
