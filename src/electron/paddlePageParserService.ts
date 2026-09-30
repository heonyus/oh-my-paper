import { access, mkdir, readFile, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import {
  type DocumentOcrProviderStatus,
  documentOcrProviderStatusSchema,
} from "../shared/documentOcr"
import {
  type DocumentPageParseProgress,
  type DocumentPageParseResult,
  documentPageParseResultSchema,
  normalizeParsedDocumentPage,
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../shared/documentPageModel"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import { resolveDocumentPath } from "./documentService"
import { buildOfflineSubprocessEnv } from "./offlineSubprocessEnvironment"
import { paddleInstallRunning, readPaddleInstallProgress } from "./paddleInstallState"
import {
  createPaddleVlmServer,
  type PaddleVlmConnection,
  type PaddleVlmServer,
} from "./paddleVlmServer"
import { PaddleVlWorker, PaddleVlWorkerError, type PaddleVlWorkerLaunch } from "./paddleVlWorker"
import type { WorkspaceStore } from "./workspaceStore"

const parserConfigVersion = "page-v3"
/** Pages per worker request; documents imported together take turns between requests. */
const PAGES_PER_REQUEST = 8
/** Without work for this long, stop the worker and the GPU server to free GPU memory. */
const IDLE_SHUTDOWN_MS = 10 * 60_000

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export function paddlePageParserRuntimePython(
  home: string,
  platform: NodeJS.Platform,
  configured?: string,
): string {
  if (configured) return configured
  const root = join(home, ".ohmypaper", "paddle-vl-runtime")
  return platform === "win32" ? join(root, "Scripts", "python.exe") : join(root, "bin", "python")
}

export function paddleVlWorkerScriptPath(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
): string {
  return packaged
    ? join(resourcesPath, "layout", "paddle_vl_worker.py")
    : join(appPath, "src", "layout", "paddle_vl_worker.py")
}

export type PaddlePageParserServiceOptions = {
  readonly appPath: string
  readonly resourcesPath: string
  readonly packaged: boolean
  readonly home?: string
  readonly platform?: NodeJS.Platform
  readonly python?: string | undefined
  readonly readinessMarker?: string | undefined
  readonly vlmServer?: PaddleVlmServer | undefined
  readonly idleShutdownMs?: number
}

type PaddlePageParseInput = {
  readonly documentId: DocumentId
  readonly pageNumber: number
  readonly store: WorkspaceStore
  readonly onProgress?: ((progress: DocumentPageParseProgress) => void) | undefined
}

type PageRequest = {
  readonly settle: ((result: DocumentPageParseResult) => void)[]
  readonly progress: ((progress: DocumentPageParseProgress) => void)[]
}

type DocumentBatch = {
  readonly document: DocumentRecord
  readonly store: WorkspaceStore
  readonly directory: string
  readonly queued: number[]
  readonly running: Set<number>
  readonly requests: Map<number, PageRequest>
}

function pageDirectory(store: WorkspaceStore, document: DocumentRecord): string {
  return join(store.root, "parsed-pages", document.hash, `paddleocr-vl-1.6-${parserConfigVersion}`)
}

async function readCachedPage(
  directory: string,
  document: DocumentRecord,
  pageNumber: number,
): Promise<ParsedDocumentPage | null> {
  const file = join(directory, `page-${pageNumber}.json`)
  try {
    const page = normalizeParsedDocumentPage(
      parsedDocumentPageSchema.parse(JSON.parse(await readFile(file, "utf8"))),
    )
    if (page.sourceHash === document.hash && page.pageNumber === pageNumber) return page
  } catch (error) {
    if (isMissingFile(error)) return null
    if (!(error instanceof z.ZodError || error instanceof SyntaxError)) throw error
  }
  await rm(file, { force: true })
  return null
}

async function cachedPageExists(directory: string, pageNumber: number): Promise<boolean> {
  try {
    await access(join(directory, `page-${pageNumber}.json`))
    return true
  } catch (error) {
    if (isMissingFile(error)) return false
    throw error
  }
}

/**
 * Parses pages with PaddleOCR-VL through one long-lived worker. A request for any page
 * queues the whole document, so later pages are usually cached before anyone asks.
 * Recognition runs on the platform's GPU server (vLLM in WSL, MLX on Apple silicon) when
 * installed, and in-process otherwise.
 */
export class PaddlePageParserService {
  readonly #vlmServer: PaddleVlmServer
  readonly #batches = new Map<string, DocumentBatch>()
  #engine: PaddleVlWorker | null = null
  #engineStarting: Promise<PaddleVlWorker> | null = null
  #pumping = false
  #turn = 0
  #idleTimer: NodeJS.Timeout | null = null
  #disposed = false
  /** The GPU server is installed but failed to start, so recognition runs in-process. */
  #accelerationFailed = false

  constructor(readonly options: PaddlePageParserServiceOptions) {
    this.#vlmServer =
      options.vlmServer ?? createPaddleVlmServer(options.home ? { home: options.home } : {})
  }

  async status(): Promise<DocumentOcrProviderStatus> {
    const [configured, acceleration] = await Promise.all([
      this.#runtimeInstalled(),
      this.#vlmServer.acceleration(),
    ])
    const home = this.options.home ?? homedir()
    const installing = !configured && paddleInstallRunning(home)
    const installProgress = installing ? readPaddleInstallProgress(home) : null
    return documentOcrProviderStatusSchema.parse({
      configured,
      ...(installing ? { installing } : {}),
      ...(installProgress ? { installProgress } : {}),
      provider: "paddle",
      model: "PaddleOCR-VL-1.6",
      acceleration: this.#accelerationFailed ? null : acceleration,
    })
  }

  async parse(input: PaddlePageParseInput): Promise<DocumentPageParseResult> {
    const { documentId, pageNumber, store } = input
    const document = await store.findDocument(documentId)
    if (!document) return { status: "unavailable", reason: "unknown_document" }
    if (pageNumber > document.pageCount) return { status: "unavailable", reason: "invalid_page" }
    const directory = pageDirectory(store, document)
    const cached = await readCachedPage(directory, document, pageNumber)
    if (cached) return documentPageParseResultSchema.parse({ status: "ready", page: cached })
    if (!(await this.#runtimeInstalled()))
      return { status: "unavailable", reason: "runtime_missing" }
    if (this.#disposed) return { status: "unavailable", reason: "execution_failed" }
    return this.#request(document, store, directory, pageNumber, input.onProgress)
  }

  /** A page this service already parsed, without queueing any work. */
  readCached(
    document: DocumentRecord,
    pageNumber: number,
    store: WorkspaceStore,
  ): Promise<ParsedDocumentPage | null> {
    return readCachedPage(pageDirectory(store, document), document, pageNumber)
  }

  /** Stops queueing pages of a deleted document; a request already in the worker still ends. */
  forget(hash: string): void {
    const batch = this.#batches.get(hash)
    if (!batch) return
    batch.queued.length = 0
    for (const pageNumber of [...batch.requests.keys()])
      this.#settle(batch, pageNumber, { status: "unavailable", reason: "unknown_document" })
  }

  dispose(): void {
    this.#disposed = true
    this.#clearIdleTimer()
    for (const batch of this.#batches.values()) {
      for (const pageNumber of [...batch.requests.keys()])
        this.#settle(batch, pageNumber, { status: "unavailable", reason: "execution_failed" })
    }
    this.#batches.clear()
    this.#shutdown()
  }

  #request(
    document: DocumentRecord,
    store: WorkspaceStore,
    directory: string,
    pageNumber: number,
    onProgress: ((progress: DocumentPageParseProgress) => void) | undefined,
  ): Promise<DocumentPageParseResult> {
    let batch = this.#batches.get(document.hash)
    if (!batch) {
      batch = {
        document,
        store,
        directory,
        queued: Array.from({ length: document.pageCount }, (_, index) => index + 1),
        running: new Set(),
        requests: new Map(),
      }
      this.#batches.set(document.hash, batch)
    }
    // The page someone is waiting for goes first.
    if (!batch.running.has(pageNumber)) {
      const index = batch.queued.indexOf(pageNumber)
      if (index !== -1) batch.queued.splice(index, 1)
      batch.queued.unshift(pageNumber)
    }
    const request = batch.requests.get(pageNumber) ?? { settle: [], progress: [] }
    batch.requests.set(pageNumber, request)
    if (onProgress) {
      request.progress.push(onProgress)
      onProgress({
        id: document.id,
        pageNumber,
        stage: this.#engine?.alive ? "document-analyzing" : "engine-starting",
      })
    }
    const result = new Promise<DocumentPageParseResult>((resolve) => request.settle.push(resolve))
    void this.#pump()
    return result
  }

  async #pump(): Promise<void> {
    if (this.#pumping || this.#disposed) return
    this.#pumping = true
    this.#clearIdleTimer()
    try {
      for (let next = await this.#nextRequest(); next; next = await this.#nextRequest())
        await this.#run(next.batch, next.pages)
    } catch (error) {
      console.warn("[paddle-vl] page queue stopped", error)
      this.#failQueued("execution_failed")
    } finally {
      this.#pumping = false
    }
    if ([...this.#batches.values()].some((batch) => batch.queued.length > 0)) void this.#pump()
    else this.#scheduleIdleShutdown()
  }

  async #nextRequest(): Promise<{ batch: DocumentBatch; pages: number[] } | null> {
    while (this.#batches.size > 0 && !this.#disposed) {
      const batches = [...this.#batches.values()]
      const batch = batches[this.#turn % batches.length]
      this.#turn += 1
      if (!batch) return null
      const pages: number[] = []
      while (pages.length < PAGES_PER_REQUEST) {
        const pageNumber = batch.queued.shift()
        if (pageNumber === undefined) break
        // Taken from the queue: a request arriving during the cache checks below must
        // wait for this pass instead of queueing the page a second time.
        batch.running.add(pageNumber)
        if (!(await cachedPageExists(batch.directory, pageNumber))) {
          pages.push(pageNumber)
          continue
        }
        // Only a page someone is waiting for needs its cache read back.
        const cached = batch.requests.has(pageNumber)
          ? await readCachedPage(batch.directory, batch.document, pageNumber)
          : null
        if (cached) this.#settle(batch, pageNumber, { status: "ready", page: cached })
        if (cached || !batch.requests.has(pageNumber)) batch.running.delete(pageNumber)
        else pages.push(pageNumber)
      }
      if (pages.length > 0) return { batch, pages }
      this.#batches.delete(batch.document.hash)
    }
    return null
  }

  async #run(batch: DocumentBatch, pages: number[]): Promise<void> {
    for (const pageNumber of pages) batch.running.add(pageNumber)
    let worker: PaddleVlWorker
    try {
      worker = await this.#ensureEngine()
    } catch (error) {
      console.warn("[paddle-vl] PaddleOCR-VL could not start", error)
      for (const pageNumber of pages) batch.running.delete(pageNumber)
      // Starting again for every queued request would repeat the same long wait.
      this.#failQueued("model_unavailable")
      return
    }
    const pending = new Set(pages)
    const collecting: Promise<void>[] = []
    try {
      for (const pageNumber of pages) this.#report(batch, pageNumber, "document-analyzing")
      const pdfPath = await resolveDocumentPath(batch.document.id, batch.store)
      await mkdir(batch.directory, { recursive: true })
      await worker.parse(
        { pdfPath, sourceHash: batch.document.hash, pages, outputDir: batch.directory },
        (pageNumber) => {
          if (pending.delete(pageNumber)) collecting.push(this.#collect(batch, pageNumber))
        },
      )
    } catch (error) {
      console.warn(
        `[paddle-vl] pages ${[...pending].join(", ")} of ${batch.document.id} failed`,
        error,
      )
      // An unexpected failure usually means the GPU server went away, which the worker
      // cannot recover from; restart both for the next pages.
      if (error instanceof PaddleVlWorkerError && error.detail === "execution_failed")
        this.#shutdown()
    } finally {
      await Promise.all(collecting)
      for (const pageNumber of pending)
        this.#settle(batch, pageNumber, { status: "unavailable", reason: "execution_failed" })
      for (const pageNumber of pages) batch.running.delete(pageNumber)
    }
  }

  async #collect(batch: DocumentBatch, pageNumber: number): Promise<void> {
    let page: ParsedDocumentPage | null = null
    try {
      page = await readCachedPage(batch.directory, batch.document, pageNumber)
    } catch (error) {
      console.warn(`[paddle-vl] could not read page ${pageNumber} of ${batch.document.id}`, error)
    }
    this.#settle(
      batch,
      pageNumber,
      page ? { status: "ready", page } : { status: "unavailable", reason: "invalid_output" },
    )
  }

  #report(
    batch: DocumentBatch,
    pageNumber: number,
    stage: DocumentPageParseProgress["stage"],
  ): void {
    for (const listener of batch.requests.get(pageNumber)?.progress ?? [])
      listener({ id: batch.document.id, pageNumber, stage })
  }

  #settle(batch: DocumentBatch, pageNumber: number, result: DocumentPageParseResult): void {
    const request = batch.requests.get(pageNumber)
    if (!request) return
    batch.requests.delete(pageNumber)
    const parsed = documentPageParseResultSchema.parse(result)
    for (const settle of request.settle) settle(parsed)
  }

  #failQueued(reason: "model_unavailable" | "execution_failed"): void {
    for (const batch of this.#batches.values()) {
      for (const pageNumber of [...batch.requests.keys()])
        this.#settle(batch, pageNumber, { status: "unavailable", reason })
    }
    this.#batches.clear()
  }

  #ensureEngine(): Promise<PaddleVlWorker> {
    if (this.#engine?.alive) return Promise.resolve(this.#engine)
    this.#engine = null
    this.#engineStarting ??= this.#startEngine().finally(() => {
      this.#engineStarting = null
    })
    return this.#engineStarting
  }

  async #startEngine(): Promise<PaddleVlWorker> {
    const launch = await this.#vlmServer.launch().catch((error: unknown) => {
      console.warn("[paddle-vl] GPU server could not start; recognizing in-process", error)
      return null
    })
    // The worker loads its layout model while the GPU server is still starting.
    const [started, ready] = await Promise.allSettled([
      PaddleVlWorker.start(this.#workerLaunch(launch?.connection ?? null)),
      launch?.ready,
    ])
    let worker: PaddleVlWorker
    if (ready.status === "rejected") {
      if (started.status === "fulfilled") started.value.stop()
      console.warn("[paddle-vl] GPU server did not start; recognizing in-process", ready.reason)
      this.#vlmServer.stop()
      this.#accelerationFailed = true
      worker = await PaddleVlWorker.start(this.#workerLaunch(null))
    } else if (started.status === "rejected") {
      this.#vlmServer.stop()
      throw started.reason
    } else {
      worker = started.value
      if (launch) this.#accelerationFailed = false
    }
    if (this.#disposed) {
      worker.stop()
      this.#vlmServer.stop()
      throw new Error("PaddleOCR-VL parser was disposed")
    }
    this.#engine = worker
    return worker
  }

  #workerLaunch(vlm: PaddleVlmConnection | null): PaddleVlWorkerLaunch {
    const home = this.options.home ?? homedir()
    return {
      python: this.#python(home),
      script: this.#script(),
      vlm,
      env: buildOfflineSubprocessEnv({
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
        PADDLE_PDX_CACHE_HOME: join(home, ".paddlex"),
        HF_HOME: join(home, ".cache", "huggingface"),
        NO_PROXY: "127.0.0.1,localhost",
        // Grow GPU memory on demand so layout detection fits next to the VLM server.
        FLAGS_allocator_strategy: "auto_growth",
        ...(vlm ? { OH_MY_PAPER_VLM_API_KEY: vlm.apiKey } : {}),
      }),
    }
  }

  #scheduleIdleShutdown(): void {
    this.#clearIdleTimer()
    if (this.#disposed || (!this.#engine && !this.#engineStarting)) return
    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = null
      if (!this.#pumping && this.#batches.size === 0) this.#shutdown()
    }, this.options.idleShutdownMs ?? IDLE_SHUTDOWN_MS)
    this.#idleTimer.unref()
  }

  #clearIdleTimer(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer)
    this.#idleTimer = null
  }

  #shutdown(): void {
    this.#engine?.stop()
    this.#engine = null
    this.#vlmServer.stop()
  }

  #python(home: string): string {
    return paddlePageParserRuntimePython(
      home,
      this.options.platform ?? process.platform,
      this.options.python,
    )
  }

  #script(): string {
    return paddleVlWorkerScriptPath(
      this.options.appPath,
      this.options.resourcesPath,
      this.options.packaged,
    )
  }

  async #runtimeInstalled(): Promise<boolean> {
    const home = this.options.home ?? homedir()
    const marker =
      this.options.readinessMarker ??
      join(home, ".ohmypaper", "paddle-vl-runtime", ".ready-v1.6-layout-v2")
    try {
      await Promise.all([access(this.#python(home)), access(this.#script()), access(marker)])
      return true
    } catch (error) {
      if (isMissingFile(error)) return false
      throw error
    }
  }
}
