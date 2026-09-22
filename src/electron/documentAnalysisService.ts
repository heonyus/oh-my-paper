import {
  type DocumentAnalysisJob,
  type DocumentAnalysisSnapshot,
  documentAnalysisSnapshotSchema,
} from "../shared/documentAnalysis"
import type { DocumentPageParseResult } from "../shared/documentPageModel"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import {
  analysisFailureMessage,
  completeAnalysisJob,
  failedAnalysisJob,
  queuedAnalysisJob,
  runningAnalysisJob,
} from "./documentAnalysisJobs"
import {
  type DocumentAnalysisEngine,
  type DocumentAnalysisPageParser,
  parseAnalysisPage,
} from "./documentAnalysisPageRunner"
import { DocumentAnalysisStateStore } from "./documentAnalysisStateStore"
import type { WorkspaceStore } from "./workspaceStore"

export class DocumentAnalysisService {
  readonly #jobs = new Map<DocumentId, DocumentAnalysisJob>()
  readonly #listeners = new Set<(snapshot: DocumentAnalysisSnapshot) => void>()
  readonly #pending = new Set<DocumentId>()
  readonly #readyDocuments = new Set<DocumentId>()
  readonly #queue: DocumentRecord[] = []
  readonly #scheduling = new Map<DocumentId, Promise<void>>()
  readonly #running = new Set<Promise<void>>()
  readonly #abort = new AbortController()
  readonly #maxConcurrency: number
  readonly #fallbackParser: DocumentAnalysisPageParser | null
  readonly #stateStore: DocumentAnalysisStateStore
  readonly #ready: Promise<void>
  #disposePromise: Promise<void> | null = null
  #disposed = false

  constructor(
    readonly store: WorkspaceStore,
    readonly parser: DocumentAnalysisPageParser,
    options: {
      readonly maxConcurrency?: number
      readonly fallbackParser?: DocumentAnalysisPageParser
    } = {},
  ) {
    const concurrency = options.maxConcurrency
    this.#maxConcurrency =
      typeof concurrency === "number" && Number.isInteger(concurrency) && concurrency > 0
        ? concurrency
        : 2
    this.#fallbackParser = options.fallbackParser ?? null
    this.#stateStore = new DocumentAnalysisStateStore(store.root)
    this.#ready = this.#loadState()
  }

  snapshot(): DocumentAnalysisSnapshot {
    return documentAnalysisSnapshotSchema.parse([...this.#jobs.values()])
  }

  subscribe(listener: (snapshot: DocumentAnalysisSnapshot) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async resumePending(): Promise<void> {
    const [loaded] = await Promise.allSettled([this.#ready])
    if (loaded?.status !== "fulfilled") return
    const workspace = await this.store.read()
    for (const document of workspace.documents) {
      if (this.#readyDocuments.has(document.id)) continue
      await Promise.allSettled([this.schedule(document.id)])
    }
  }

  schedule(documentId: DocumentId): Promise<void> {
    const active = this.#scheduling.get(documentId)
    if (active) return active
    const operation = this.#schedule(documentId).finally(() => this.#scheduling.delete(documentId))
    this.#scheduling.set(documentId, operation)
    return operation
  }

  async #schedule(documentId: DocumentId): Promise<void> {
    await this.#ready
    if (this.#disposed) return
    if (this.#jobs.has(documentId)) return
    const workspace = await this.store.read()
    if (this.#disposed) return
    const document = workspace.documents.find((candidate) => candidate.id === documentId)
    if (!document) return
    this.#pending.add(documentId)
    await this.#persistPending()
    if (this.#disposed) return
    this.#jobs.set(documentId, queuedAnalysisJob(document))
    this.#emit()
    this.#queue.push(document)
    this.#drainQueue()
  }

  async reschedule(documentId: DocumentId): Promise<void> {
    await this.#ready
    if (this.#disposed) return
    const current = this.#jobs.get(documentId)
    if (current && current.state !== "failed" && current.state !== "complete") return
    if (current) this.#jobs.delete(documentId)
    await this.schedule(documentId)
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise
    this.#disposed = true
    this.#abort.abort()
    this.#listeners.clear()
    this.#queue.length = 0
    this.#disposePromise = Promise.allSettled([
      this.#ready,
      ...this.#scheduling.values(),
      ...this.#running,
    ]).then(() => this.#persistPending())
    return this.#disposePromise
  }

  #drainQueue(): void {
    if (this.#disposed) return
    while (this.#running.size < this.#maxConcurrency && this.#queue.length > 0) {
      const next = this.#queue.shift()
      if (!next) break
      const operation = this.#run(next)
      this.#running.add(operation)
      const finish = (): void => {
        this.#running.delete(operation)
        this.#drainQueue()
      }
      void operation.then(finish, finish)
    }
  }

  async #run(document: DocumentRecord): Promise<void> {
    let completedPages = 0
    let usingFallback = false
    try {
      for (let pageNumber = 1; pageNumber <= document.pageCount; pageNumber += 1) {
        if (this.#disposed) return
        const engine: DocumentAnalysisEngine = usingFallback ? "mistral" : "local"
        let result = await this.#parsePage(document, completedPages, pageNumber, engine)
        if (result.status !== "ready" && !usingFallback && this.#fallbackParser) {
          usingFallback = true
          result = await this.#parsePage(document, completedPages, pageNumber, "mistral")
        }
        if (this.#disposed) return
        if (result.status !== "ready") {
          await this.#fail(document, completedPages, analysisFailureMessage(result))
          return
        }
        completedPages = pageNumber
      }
      this.#pending.delete(document.id)
      this.#readyDocuments.add(document.id)
      await this.#persistPending()
      this.#jobs.set(document.id, completeAnalysisJob(document))
      this.#emit()
    } catch {
      await this.#fail(document, completedPages, "문서 구조 분석 중 로컬 오류가 발생했습니다")
    }
  }

  async #parsePage(
    document: DocumentRecord,
    completedPages: number,
    pageNumber: number,
    engine: DocumentAnalysisEngine,
  ): Promise<DocumentPageParseResult> {
    const parser = engine === "mistral" ? this.#fallbackParser : this.parser
    if (!parser) return { status: "unavailable", reason: "provider_unconfigured" }
    const maxAttempts = engine === "local" ? 2 : 1
    return parseAnalysisPage({
      parser,
      document,
      pageNumber,
      store: this.store,
      signal: this.#abort.signal,
      maxAttempts,
      onProgress: (stage, attempt) => {
        if (this.#disposed) return
        this.#jobs.set(
          document.id,
          runningAnalysisJob({
            document,
            completedPages,
            currentPage: pageNumber,
            stage,
            engine,
            attempt,
            maxAttempts,
          }),
        )
        this.#emit()
      },
    })
  }

  async #fail(document: DocumentRecord, completedPages: number, message: string): Promise<void> {
    if (this.#disposed) return
    await this.#persistPending()
    this.#jobs.set(document.id, failedAnalysisJob(document, completedPages, message))
    this.#emit()
  }

  #emit(): void {
    if (this.#disposed) return
    const snapshot = this.snapshot()
    for (const listener of this.#listeners) listener(snapshot)
  }

  async #loadState(): Promise<void> {
    const state = await this.#stateStore.load()
    for (const id of state.pendingIds) this.#pending.add(id)
    const workspace = await this.store.read()
    for (const id of state.readyIds) {
      const document = workspace.documents.find((candidate) => candidate.id === id)
      if (!document) continue
      this.#readyDocuments.add(id)
      this.#jobs.set(id, completeAnalysisJob(document))
    }
  }

  async #persistPending(): Promise<void> {
    await this.#stateStore.save({
      pendingIds: [...this.#pending],
      readyIds: [...this.#readyDocuments],
    })
  }
}
