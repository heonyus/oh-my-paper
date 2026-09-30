import {
  type DocumentAnalysisJob,
  type DocumentAnalysisSnapshot,
  snapshotOfAnalysisJobs,
} from "../shared/documentAnalysis"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import {
  failedAnalysisJob,
  queuedAnalysisJob,
  runningAnalysisJob,
  waitingAnalysisJob,
} from "./documentAnalysisJobs"
import type { DocumentAnalysisPageParser } from "./documentAnalysisPageRunner"
import { analyseDocumentPages } from "./documentAnalysisRun"
import { DocumentAnalysisStateStore } from "./documentAnalysisStateStore"
import { HYBRID_PAGE_CACHE_VERSION } from "./hybridPageParser"
import type { WorkspaceStore } from "./workspaceStore"

export class DocumentAnalysisService {
  readonly #jobs = new Map<DocumentId, DocumentAnalysisJob>()
  readonly #listeners = new Set<(snapshot: DocumentAnalysisSnapshot) => void>()
  readonly #pending = new Set<DocumentId>()
  readonly #readyDocuments = new Set<DocumentId>()
  /** Deleted while queued or running; their in-flight work must not report back. */
  readonly #forgotten = new Set<DocumentId>()
  readonly #queue: DocumentRecord[] = []
  /** Held while the OCR engine downloads, so they wait instead of failing without it. */
  readonly #waitingForEngine: DocumentRecord[] = []
  readonly #engineInstalling: () => Promise<boolean>
  readonly #enginePollMs: number
  #enginePoll: ReturnType<typeof setInterval> | null = null
  readonly #scheduling = new Map<DocumentId, Promise<void>>()
  readonly #running = new Set<Promise<void>>()
  readonly #abort = new AbortController()
  readonly #maxConcurrency: number
  readonly #pageConcurrency: number
  readonly #stateStore: DocumentAnalysisStateStore
  /** Whether the saved state was read; an unread state is neither resumed nor overwritten. */
  readonly #ready: Promise<boolean>
  #disposePromise: Promise<void> | null = null
  #disposed = false

  constructor(
    readonly store: WorkspaceStore,
    readonly parser: DocumentAnalysisPageParser,
    options: {
      readonly maxConcurrency?: number
      readonly pageConcurrency?: number
      /** Documents analysed under another parser version are analysed again. */
      readonly parserVersion?: string
      /** True while the OCR engine is being installed and is not ready yet. */
      readonly engineInstalling?: () => Promise<boolean>
      readonly enginePollMs?: number
    } = {},
  ) {
    this.#engineInstalling = options.engineInstalling ?? (async () => false)
    this.#enginePollMs = options.enginePollMs ?? 5_000
    const positiveInt = (value: number | undefined, fallback: number): number =>
      typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback
    this.#maxConcurrency = positiveInt(options.maxConcurrency, 2)
    this.#pageConcurrency = positiveInt(options.pageConcurrency, 4)
    this.#stateStore = new DocumentAnalysisStateStore(
      store.root,
      options.parserVersion ?? HYBRID_PAGE_CACHE_VERSION,
    )
    this.#ready = this.#loadState()
  }

  snapshot(): DocumentAnalysisSnapshot {
    return snapshotOfAnalysisJobs(this.#jobs.values())
  }

  subscribe(listener: (snapshot: DocumentAnalysisSnapshot) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  isReady(documentId: DocumentId): boolean {
    return this.#readyDocuments.has(documentId)
  }

  /** Queues every library document not analysed yet, in one pass and one state write. */
  async resumePending(): Promise<void> {
    if (!(await this.#ready) || this.#disposed) return
    const documents = await this.store.listDocuments()
    if (this.#disposed) return
    const unready = documents.filter(
      ({ id }) =>
        !this.#readyDocuments.has(id) &&
        !this.#forgotten.has(id) &&
        !this.#jobs.has(id) &&
        !this.#scheduling.has(id),
    )
    if (unready.length === 0) return
    for (const document of unready) this.#enqueue(document)
    this.#emit()
    this.#drainQueue()
    await this.#persist()
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
    this.#forgotten.delete(documentId)
    if (this.#jobs.has(documentId)) return
    const document = await this.store.findDocument(documentId)
    if (this.#disposed || !document) return
    if (this.#readyDocuments.has(documentId) || this.#jobs.has(documentId)) return
    this.#enqueue(document)
    this.#emit()
    this.#drainQueue()
    // Resuming queues every unready document again, so the import need not wait for the write.
    void this.#persist()
  }

  async reschedule(documentId: DocumentId): Promise<void> {
    await this.#ready
    if (this.#disposed) return
    const current = this.#jobs.get(documentId)
    if (current && current.state !== "failed" && current.state !== "complete") return
    if (current) this.#jobs.delete(documentId)
    this.#readyDocuments.delete(documentId)
    await this.schedule(documentId)
  }

  /** Drops a document that is being deleted from the queue and the persisted state. */
  async forget(documentId: DocumentId): Promise<void> {
    await this.#ready
    this.#forgotten.add(documentId)
    const queued = this.#queue.findIndex((document) => document.id === documentId)
    if (queued !== -1) this.#queue.splice(queued, 1)
    const waiting = this.#waitingForEngine.findIndex((document) => document.id === documentId)
    if (waiting !== -1) this.#waitingForEngine.splice(waiting, 1)
    this.#pending.delete(documentId)
    this.#readyDocuments.delete(documentId)
    this.#jobs.delete(documentId)
    this.#emit()
    await this.#persist()
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise
    this.#disposed = true
    this.#abort.abort()
    this.#listeners.clear()
    this.#queue.length = 0
    this.#waitingForEngine.length = 0
    this.#stopEnginePoll()
    this.#disposePromise = Promise.allSettled([
      this.#ready,
      ...this.#scheduling.values(),
      ...this.#running,
    ]).then(() => this.#persist())
    return this.#disposePromise
  }

  #enqueue(document: DocumentRecord): void {
    this.#pending.add(document.id)
    this.#jobs.set(document.id, queuedAnalysisJob(document))
    this.#queue.push(document)
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
    const cancelled = (): boolean => this.#disposed || this.#forgotten.has(document.id)
    if (await this.#engineInstalling().catch(() => false)) {
      if (cancelled()) return
      this.#waitingForEngine.push(document)
      this.#jobs.set(document.id, waitingAnalysisJob(document))
      this.#emit()
      this.#startEnginePoll()
      return
    }
    const outcome = await analyseDocumentPages({
      document,
      parser: this.parser,
      store: this.store,
      signal: this.#abort.signal,
      pageConcurrency: this.#pageConcurrency,
      cancelled,
      onProgress: (progress) => {
        this.#jobs.set(document.id, runningAnalysisJob({ document, ...progress }))
        this.#emit()
      },
    })
    if (cancelled()) return
    if (outcome.status === "failed") {
      const { completedPages, message } = outcome
      this.#jobs.set(document.id, failedAnalysisJob(document, completedPages, message))
      this.#emit()
      return
    }
    this.#pending.delete(document.id)
    this.#readyDocuments.add(document.id)
    this.#jobs.delete(document.id)
    this.#emit()
    void this.#persist()
  }

  /** Checks the engine until its install ends, then queues the documents that waited for it. */
  #startEnginePoll(): void {
    if (this.#enginePoll || this.#disposed) return
    let checking = false
    this.#enginePoll = setInterval(() => {
      if (checking) return
      checking = true
      void this.#engineInstalling()
        .catch(() => false)
        .then((installing) => {
          if (installing || this.#disposed) return
          this.#stopEnginePoll()
          const waiting = this.#waitingForEngine.splice(0)
          for (const document of waiting) {
            if (this.#forgotten.has(document.id)) continue
            this.#jobs.set(document.id, queuedAnalysisJob(document))
            this.#queue.push(document)
          }
          this.#emit()
          this.#drainQueue()
        })
        .finally(() => {
          checking = false
        })
    }, this.#enginePollMs)
    this.#enginePoll.unref?.()
  }

  #stopEnginePoll(): void {
    if (this.#enginePoll) clearInterval(this.#enginePoll)
    this.#enginePoll = null
  }

  /** Tells listeners; a snapshot or listener that throws is logged, never stops the analysis. */
  #emit(): void {
    if (this.#disposed || this.#listeners.size === 0) return
    try {
      const snapshot = this.snapshot()
      for (const listener of this.#listeners) {
        try {
          listener(snapshot)
        } catch (error) {
          console.warn("[document-analysis] a progress listener failed", error)
        }
      }
    } catch (error) {
      console.warn("[document-analysis] could not build the progress snapshot", error)
    }
  }

  async #loadState(): Promise<boolean> {
    try {
      const state = await this.#stateStore.load()
      const known = new Set((await this.store.listDocuments()).map((document) => document.id))
      for (const id of state.pendingIds) if (known.has(id)) this.#pending.add(id)
      for (const id of state.readyIds) if (known.has(id)) this.#readyDocuments.add(id)
      return true
    } catch (error) {
      console.warn("[document-analysis] could not read the analysis queue", error)
      return false
    }
  }

  /** Saves the queue state; a failed write is logged and never reaches analysis or import. */
  async #persist(): Promise<void> {
    if (!(await this.#ready)) return
    try {
      await this.#stateStore.save({
        pendingIds: [...this.#pending],
        readyIds: [...this.#readyDocuments],
      })
    } catch (error) {
      console.warn("[document-analysis] could not save the analysis queue", error)
    }
  }
}
