import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  type DocumentAnalysisJob,
  type DocumentAnalysisSnapshot,
  documentAnalysisSnapshotSchema,
} from "../shared/documentAnalysis"
import type {
  DocumentPageParseProgress,
  DocumentPageParseResult,
} from "../shared/documentPageModel"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import { documentIdSchema } from "../shared/schemas"
import type { WorkspaceStore } from "./workspaceStore"

const pendingAnalysisSchema = z.object({
  version: z.literal(1),
  documentIds: z.array(documentIdSchema).max(64),
})

type PageParser = {
  readonly parse: (input: {
    readonly documentId: DocumentId
    readonly pageNumber: number
    readonly store: WorkspaceStore
    readonly signal: AbortSignal
    readonly onProgress?: (progress: DocumentPageParseProgress) => void
  }) => Promise<DocumentPageParseResult>
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function failureMessage(result: DocumentPageParseResult): string {
  if (result.status === "ready") return ""
  if (result.reason === "runtime_missing") return "로컬 PaddleOCR-VL 설치가 필요합니다"
  if (result.reason === "provider_unconfigured") return "Mistral OCR API 키 설정이 필요합니다"
  if (result.reason === "model_unavailable") return "로컬 분석 모델을 시작하지 못했습니다"
  return "문서 구조 분석을 완료하지 못했습니다"
}

export class DocumentAnalysisService {
  readonly #jobs = new Map<DocumentId, DocumentAnalysisJob>()
  readonly #listeners = new Set<(snapshot: DocumentAnalysisSnapshot) => void>()
  readonly #pending = new Set<DocumentId>()
  readonly #queue: DocumentRecord[] = []
  readonly #scheduling = new Map<DocumentId, Promise<void>>()
  readonly #running = new Set<Promise<void>>()
  readonly #abort = new AbortController()
  readonly #maxConcurrency: number
  readonly #pendingFile: string
  readonly #ready: Promise<void>
  #writeQueue: Promise<void> = Promise.resolve()
  #disposePromise: Promise<void> | null = null
  #disposed = false

  constructor(
    readonly store: WorkspaceStore,
    readonly parser: PageParser,
    options: { readonly maxConcurrency?: number } = {},
  ) {
    const concurrency = options.maxConcurrency
    this.#maxConcurrency =
      typeof concurrency === "number" && Number.isInteger(concurrency) && concurrency > 0
        ? concurrency
        : 2
    this.#pendingFile = join(store.root, "document-analysis-queue.json")
    this.#ready = this.#loadPending()
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
    for (const documentId of [...this.#pending]) {
      await Promise.allSettled([this.schedule(documentId)])
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
    this.#jobs.set(documentId, {
      id: document.id,
      title: document.title,
      pageCount: document.pageCount,
      completedPages: 0,
      state: "queued",
    })
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
    try {
      for (let pageNumber = 1; pageNumber <= document.pageCount; pageNumber += 1) {
        if (this.#disposed) return
        this.#setRunning(document, completedPages, pageNumber, "engine-starting")
        const result = await this.parser.parse({
          documentId: document.id,
          pageNumber,
          store: this.store,
          signal: this.#abort.signal,
          onProgress: ({ stage }) => this.#setRunning(document, completedPages, pageNumber, stage),
        })
        if (this.#disposed) return
        if (result.status !== "ready") {
          await this.#fail(document, completedPages, failureMessage(result))
          return
        }
        completedPages = pageNumber
      }
      this.#pending.delete(document.id)
      await this.#persistPending()
      this.#jobs.set(document.id, {
        id: document.id,
        title: document.title,
        pageCount: document.pageCount,
        completedPages,
        state: "complete",
      })
      this.#emit()
      setTimeout(() => {
        if (this.#jobs.get(document.id)?.state !== "complete") return
        this.#jobs.delete(document.id)
        this.#emit()
      }, 4_000)
    } catch {
      await this.#fail(document, completedPages, "문서 구조 분석 중 로컬 오류가 발생했습니다")
    }
  }

  async #fail(document: DocumentRecord, completedPages: number, message: string): Promise<void> {
    if (this.#disposed) return
    this.#pending.delete(document.id)
    await this.#persistPending()
    this.#jobs.set(document.id, {
      id: document.id,
      title: document.title,
      pageCount: document.pageCount,
      completedPages,
      state: "failed",
      message,
    })
    this.#emit()
  }

  #setRunning(
    document: DocumentRecord,
    completedPages: number,
    currentPage: number,
    stage: DocumentPageParseProgress["stage"],
  ): void {
    if (this.#disposed) return
    this.#jobs.set(document.id, {
      id: document.id,
      title: document.title,
      pageCount: document.pageCount,
      completedPages,
      currentPage,
      stage,
      state: "running",
    })
    this.#emit()
  }

  #emit(): void {
    if (this.#disposed) return
    const snapshot = this.snapshot()
    for (const listener of this.#listeners) listener(snapshot)
  }

  async #loadPending(): Promise<void> {
    try {
      const parsed = pendingAnalysisSchema.parse(
        JSON.parse(await readFile(this.#pendingFile, "utf8")),
      )
      for (const id of parsed.documentIds) this.#pending.add(id)
    } catch (error) {
      if (!(isMissingFile(error) || error instanceof SyntaxError || error instanceof z.ZodError))
        throw error
    }
  }

  async #persistPending(): Promise<void> {
    const documentIds = [...this.#pending]
    const operation = this.#writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.store.root, { recursive: true })
        const temporaryFile = `${this.#pendingFile}.${randomUUID()}.tmp`
        await writeFile(temporaryFile, JSON.stringify({ version: 1, documentIds }), {
          encoding: "utf8",
          mode: 0o600,
        })
        await rename(temporaryFile, this.#pendingFile)
      })
    this.#writeQueue = operation
    await operation
  }
}
