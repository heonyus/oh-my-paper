// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { DocumentAnalysisService } from "../../src/electron/documentAnalysisService"
import { HYBRID_PAGE_CACHE_VERSION } from "../../src/electron/hybridPageParser"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import type { DocumentPageParseResult } from "../../src/shared/documentPageModel"
import type { DocumentRecord } from "../../src/shared/schemas"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

function record(seed: string, title: string) {
  return documentRecordSchema.parse({
    id: documentIdSchema.parse(seed.repeat(16)),
    name: `${title}.pdf`,
    hash: seed.repeat(64),
    bytes: 100,
    importedAt: "2026-09-03T00:00:00.000Z",
    pageCount: 2,
    title,
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

function readyPage(
  sourceHash: DocumentRecord["hash"],
  pageNumber: number,
): DocumentPageParseResult {
  return {
    status: "ready",
    page: {
      schemaVersion: "1.0.0",
      sourceHash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber,
      width: 100,
      height: 100,
      blocks: [],
    },
  }
}

class Deferred<T> {
  readonly promise: Promise<T>
  #resolve: ((value: T) => void) | null = null
  #reject: ((reason?: unknown) => void) | null = null

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.#resolve = resolve
      this.#reject = reject
    })
  }

  resolve(value: T): void {
    if (!this.#resolve) throw new Error("deferred resolve is unavailable")
    this.#resolve(value)
  }

  reject(reason: Error): void {
    if (!this.#reject) throw new Error("deferred reject is unavailable")
    this.#reject(reason)
  }
}

describe("DocumentAnalysisService", () => {
  it("retries a page locally before marking the document failed", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-retry-"))
    const store = new WorkspaceStore(root)
    const document = record("9", "Retry paper")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    let attempts = 0
    const parser = {
      parse: vi.fn(async (input: { readonly pageNumber: number }) => {
        attempts += 1
        if (attempts === 1)
          return { status: "unavailable" as const, reason: "execution_failed" as const }
        return readyPage(document.hash, input.pageNumber)
      }),
    }
    const service = new DocumentAnalysisService(store, parser, { maxConcurrency: 1 })

    try {
      await service.schedule(document.id)
      await vi.waitFor(() => expect(service.isReady(document.id)).toBe(true))
      expect(parser.parse).toHaveBeenCalledTimes(3)
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("marks the document failed after both local attempts fail", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-fallback-"))
    const store = new WorkspaceStore(root)
    const document = record("7", "Fallback paper")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const localParser = {
      parse: vi.fn(async () => ({
        status: "unavailable" as const,
        reason: "execution_failed" as const,
      })),
    }
    const service = new DocumentAnalysisService(store, localParser, {
      maxConcurrency: 1,
      pageConcurrency: 1,
    })
    const snapshots: unknown[] = []
    service.subscribe((snapshot) => snapshots.push(...snapshot.jobs))

    try {
      await service.schedule(document.id)
      await vi.waitFor(() =>
        expect(service.snapshot().jobs.find((job) => job.id === document.id)?.state).toBe("failed"),
      )
      expect(localParser.parse).toHaveBeenCalledTimes(2)
      expect(snapshots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: "running", engine: "local", attempt: 2 }),
        ]),
      )
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("restores completed readiness without parsing the unchanged document again", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-ready-"))
    const store = new WorkspaceStore(root)
    const document = record("8", "Ready paper")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const parser = {
      parse: vi.fn(async (input: { readonly pageNumber: number }) =>
        readyPage(document.hash, input.pageNumber),
      ),
    }
    const first = new DocumentAnalysisService(store, parser)

    await first.schedule(document.id)
    await vi.waitFor(() => expect(first.isReady(document.id)).toBe(true))
    await first.dispose()
    const callsAfterFirstRun = parser.parse.mock.calls.length

    const reopened = new DocumentAnalysisService(store, parser)
    try {
      await reopened.resumePending()
      expect(reopened.isReady(document.id)).toBe(true)
      expect(reopened.snapshot().jobs.find((job) => job.id === document.id)).toBeUndefined()
      expect(parser.parse).toHaveBeenCalledTimes(callsAfterFirstRun)
    } finally {
      await reopened.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("cancels and drains in-flight work while preserving the pending queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-dispose-"))
    const store = new WorkspaceStore(root)
    const first = record("f", "Running paper")
    const second = record("1", "Queued paper")
    await store.save({ ...defaultWorkspace(), documents: [first, second] })
    const pendingParse = new Deferred<DocumentPageParseResult>()
    let observedSignal: AbortSignal | undefined
    const currentSignal = (): AbortSignal | undefined => observedSignal
    const parser = {
      parse: vi.fn((input: { readonly signal: AbortSignal }) => {
        observedSignal = input.signal
        return pendingParse.promise
      }),
    }
    const service = new DocumentAnalysisService(store, parser, {
      maxConcurrency: 1,
      pageConcurrency: 1,
    })

    await Promise.all([service.schedule(first.id), service.schedule(second.id)])
    await vi.waitFor(() => expect(parser.parse).toHaveBeenCalledOnce())
    let disposed = false
    const disposal = service.dispose().then(() => {
      disposed = true
    })

    expect(currentSignal()?.aborted).toBe(true)
    await Promise.resolve()
    expect(disposed).toBe(false)
    pendingParse.resolve(readyPage(first.hash, 1))
    await disposal

    expect(parser.parse).toHaveBeenCalledOnce()
    expect(service.snapshot().jobs.every((job) => job.state !== "complete")).toBe(true)
    expect(JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8"))).toEqual({
      version: 3,
      parserVersion: HYBRID_PAGE_CACHE_VERSION,
      pendingIds: expect.arrayContaining([first.id, second.id]),
      readyIds: [],
    })
    await store.close()
    await rm(root, { recursive: true, force: true })
  })

  it("parses pages of one document in parallel up to the page bound", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-parallel-"))
    const store = new WorkspaceStore(root)
    const document = record("3", "Parallel paper")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const gates: Deferred<DocumentPageParseResult>[] = []
    const parser = {
      parse: vi.fn((_input: { readonly pageNumber: number }) => {
        const gate = new Deferred<DocumentPageParseResult>()
        gates.push(gate)
        return gate.promise
      }),
    }
    const service = new DocumentAnalysisService(store, parser)

    try {
      await service.schedule(document.id)
      await vi.waitFor(() => expect(parser.parse).toHaveBeenCalledTimes(2))
      for (const gate of gates) gate.resolve(readyPage(document.hash, gates.indexOf(gate) + 1))
      await vi.waitFor(() => expect(service.isReady(document.id)).toBe(true))
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("drains a parser rejection during disposal without an unhandled rejection", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-reject-"))
    const store = new WorkspaceStore(root)
    const document = record("2", "Rejected paper")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const pendingParse = new Deferred<DocumentPageParseResult>()
    const parser = {
      parse: vi.fn(() => pendingParse.promise),
    }
    const service = new DocumentAnalysisService(store, parser, { pageConcurrency: 1 })

    await service.schedule(document.id)
    await vi.waitFor(() => expect(parser.parse).toHaveBeenCalledOnce())
    const disposal = service.dispose()
    pendingParse.reject(new Error("parser stopped"))

    await expect(disposal).resolves.toBeUndefined()
    await store.close()
    await rm(root, { recursive: true, force: true })
  })

  it("tracks multiple documents independently and persists completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-test-"))
    const store = new WorkspaceStore(root)
    const first = record("a", "First paper")
    const second = record("b", "Second paper")
    await store.save({ ...defaultWorkspace(), documents: [first, second] })
    const resolvers = new Map<string, (result: DocumentPageParseResult) => void>()
    const parser = {
      parse: vi.fn(
        (input: { readonly documentId: string; readonly pageNumber: number }) =>
          new Promise<DocumentPageParseResult>((resolve) => {
            resolvers.set(`${input.documentId}:${input.pageNumber}`, resolve)
          }),
      ),
    }
    const service = new DocumentAnalysisService(store, parser)

    try {
      await Promise.all([service.schedule(first.id), service.schedule(second.id)])
      expect(service.snapshot().jobs).toHaveLength(2)
      expect(service.snapshot().jobs.every((job) => job.state === "running")).toBe(true)

      for (const document of [first, second]) {
        const resolve = resolvers.get(`${document.id}:1`)
        if (!resolve) throw new Error("first page resolver is missing")
        resolve(readyPage(document.hash, 1))
      }
      await vi.waitFor(() =>
        expect(resolvers.has(`${first.id}:2`) && resolvers.has(`${second.id}:2`)).toBe(true),
      )
      for (const document of [first, second]) {
        const resolve = resolvers.get(`${document.id}:2`)
        if (!resolve) throw new Error("second page resolver is missing")
        resolve(readyPage(document.hash, 2))
      }
      await vi.waitFor(() => {
        expect(service.isReady(first.id)).toBe(true)
        expect(service.isReady(second.id)).toBe(true)
      })
      // A document reports ready before its queued state write lands on disk.
      await vi.waitFor(async () =>
        expect(
          JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8")),
        ).toEqual({
          version: 3,
          parserVersion: HYBRID_PAGE_CACHE_VERSION,
          pendingIds: [],
          readyIds: expect.arrayContaining([first.id, second.id]),
        }),
      )
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("bounds concurrency and processes queued successor when predecessor fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-bound-"))
    const store = new WorkspaceStore(root)
    const first = record("c", "Fail paper")
    const second = record("d", "Success paper")
    await store.save({ ...defaultWorkspace(), documents: [first, second] })

    const executionOrder: string[] = []
    const parser = {
      parse: vi.fn(async (input: { readonly documentId: string; readonly pageNumber: number }) => {
        executionOrder.push(`${input.documentId}:${input.pageNumber}`)
        if (input.documentId === first.id) {
          return { status: "unavailable" as const, reason: "runtime_missing" as const }
        }
        return readyPage(second.hash, input.pageNumber)
      }),
    }

    const service = new DocumentAnalysisService(store, parser, {
      maxConcurrency: 1,
      pageConcurrency: 1,
    })

    try {
      await Promise.all([service.schedule(first.id), service.schedule(second.id)])

      await vi.waitFor(() => {
        const firstJob = service.snapshot().jobs.find((j) => j.id === first.id)
        expect(firstJob?.state).toBe("failed")
        expect(service.isReady(second.id)).toBe(true)
      })

      const firstRanId = executionOrder[0]?.split(":")[0]
      expect(executionOrder).toEqual([
        ...executionOrder.filter((entry) => entry.startsWith(`${firstRanId}:`)),
        ...executionOrder.filter((entry) => !entry.startsWith(`${firstRanId}:`)),
      ])
      expect(executionOrder.filter((entry) => entry.startsWith(first.id))).toEqual([
        `${first.id}:1`,
        `${first.id}:1`,
      ])
      expect(executionOrder.filter((entry) => entry.startsWith(second.id))).toEqual([
        `${second.id}:1`,
        `${second.id}:2`,
      ])

      await service.schedule(first.id)
      const snapAfter = service.snapshot().jobs
      const firstJobAfter = snapAfter.find((j) => j.id === first.id)
      expect(["queued", "running", "failed"]).toContain(firstJobAfter?.state)
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("resumes a persistently failed preparation after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-fail-restart-"))
    const store = new WorkspaceStore(root)
    const failDoc = record("e", "Failed paper")
    await store.save({ ...defaultWorkspace(), documents: [failDoc] })

    let parseAttempts = 0
    const parser = {
      parse: vi.fn(async (input: { readonly pageNumber: number }) => {
        parseAttempts += 1
        if (parseAttempts <= 4) {
          return { status: "unavailable" as const, reason: "runtime_missing" as const }
        }
        return readyPage(failDoc.hash, input.pageNumber)
      }),
    }

    const service1 = new DocumentAnalysisService(store, parser, { maxConcurrency: 0 })
    await service1.schedule(failDoc.id)
    await vi.waitFor(() => {
      const job = service1.snapshot().jobs.find((j) => j.id === failDoc.id)
      expect(job?.state).toBe("failed")
    })
    await service1.dispose()

    const queueFile = JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8"))
    expect(queueFile.pendingIds).toContain(failDoc.id)

    const service2 = new DocumentAnalysisService(store, parser)
    await service2.resumePending()
    await vi.waitFor(() => {
      expect(service2.isReady(failDoc.id)).toBe(true)
    })
    expect(parseAttempts).toBe(6)
    await service2.dispose()
    await rm(root, { recursive: true, force: true })
  })

  it("analyses documents again once the parser version changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-version-"))
    const store = new WorkspaceStore(root)
    const current = record("d", "Current paper")
    const earlier = record("e", "Earlier paper")
    await store.save({ ...defaultWorkspace(), documents: [current, earlier] })
    const queueFile = join(root, "document-analysis-queue.json")
    const parser = {
      parse: vi.fn(async (input: { readonly documentId: string; readonly pageNumber: number }) =>
        readyPage(input.documentId === current.id ? current.hash : earlier.hash, input.pageNumber),
      ),
    }
    const analysedBy = (parserVersion: string, readyIds: readonly string[]) =>
      writeFile(
        queueFile,
        JSON.stringify({ version: 3, parserVersion, pendingIds: [], readyIds }),
        "utf8",
      )

    try {
      await analysedBy("parser-v2", [current.id, earlier.id])
      const unchanged = new DocumentAnalysisService(store, parser, { parserVersion: "parser-v2" })
      await unchanged.resumePending()
      await unchanged.dispose()
      expect(parser.parse).not.toHaveBeenCalled()

      const upgraded = new DocumentAnalysisService(store, parser, { parserVersion: "parser-v3" })
      await upgraded.resumePending()
      await vi.waitFor(() => {
        expect(upgraded.isReady(current.id)).toBe(true)
        expect(upgraded.isReady(earlier.id)).toBe(true)
      })
      await upgraded.dispose()
      expect(parser.parse).toHaveBeenCalledTimes(4)
      expect(JSON.parse(await readFile(queueFile, "utf8"))).toEqual({
        version: 3,
        parserVersion: "parser-v3",
        pendingIds: [],
        readyIds: expect.arrayContaining([current.id, earlier.id]),
      })

      // State written before parser versions were recorded counts as an earlier parser's.
      await writeFile(
        queueFile,
        JSON.stringify({ version: 2, pendingIds: [], readyIds: [current.id] }),
        "utf8",
      )
      const migrated = new DocumentAnalysisService(store, parser, { parserVersion: "parser-v3" })
      await migrated.resumePending()
      await vi.waitFor(() => {
        expect(migrated.isReady(current.id)).toBe(true)
        expect(migrated.isReady(earlier.id)).toBe(true)
      })
      await migrated.dispose()
      expect(parser.parse).toHaveBeenCalledTimes(8)
    } finally {
      await store.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("forgets a deleted document without letting its in-flight run report back", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-test-"))
    const store = new WorkspaceStore(root)
    const paper = record("c", "Deleted paper")
    await store.save({ ...defaultWorkspace(), documents: [paper] })
    const resolvers = new Map<number, (result: DocumentPageParseResult) => void>()
    const parser = {
      parse: vi.fn(
        (input: { readonly pageNumber: number }) =>
          new Promise<DocumentPageParseResult>((resolve) => {
            resolvers.set(input.pageNumber, resolve)
          }),
      ),
    }
    const service = new DocumentAnalysisService(store, parser, { pageConcurrency: 1 })

    try {
      await service.schedule(paper.id)
      await vi.waitFor(() => expect(resolvers.has(1)).toBe(true))

      await service.forget(paper.id)
      resolvers.get(1)?.(readyPage(paper.hash, 1))
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(service.snapshot().jobs).toEqual([])
      expect(service.isReady(paper.id)).toBe(false)
      expect(resolvers.has(2)).toBe(false)
      expect(
        JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8")),
      ).toEqual({
        version: 3,
        parserVersion: HYBRID_PAGE_CACHE_VERSION,
        pendingIds: [],
        readyIds: [],
      })

      await service.schedule(paper.id)
      expect(service.snapshot().jobs.map((job) => job.id)).toEqual([paper.id])
      await vi.waitFor(() => expect(parser.parse).toHaveBeenCalledTimes(2))
      resolvers.get(1)?.(readyPage(paper.hash, 1))
      await vi.waitFor(() => expect(parser.parse).toHaveBeenCalledTimes(3))
      resolvers.get(2)?.(readyPage(paper.hash, 2))
      await vi.waitFor(() => expect(service.isReady(paper.id)).toBe(true))
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
  it("waits for the OCR engine download instead of failing, then analyses on its own", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-engine-wait-"))
    const store = new WorkspaceStore(root)
    const document = record("5", "Waiting paper")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    let installing = true
    const parser = {
      parse: vi.fn(async (input: { readonly pageNumber: number }) =>
        readyPage(document.hash, input.pageNumber),
      ),
    }
    const service = new DocumentAnalysisService(store, parser, {
      engineInstalling: async () => installing,
      enginePollMs: 20,
    })

    try {
      await service.schedule(document.id)
      await vi.waitFor(() =>
        expect(service.snapshot().jobs.find((job) => job.id === document.id)).toMatchObject({
          state: "queued",
          message: "문서 분석 엔진을 받는 중 · 끝나면 자동으로 분석합니다",
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(parser.parse).not.toHaveBeenCalled()
      expect(service.isReady(document.id)).toBe(false)

      installing = false
      await vi.waitFor(() => expect(service.isReady(document.id)).toBe(true))
      expect(parser.parse).toHaveBeenCalledTimes(document.pageCount)
      expect(service.snapshot().jobs.find((job) => job.id === document.id)).toBeUndefined()
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("drops a document deleted while it waits for the engine", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-engine-forget-"))
    const store = new WorkspaceStore(root)
    const document = record("4", "Deleted while waiting")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    let installing = true
    const parser = { parse: vi.fn(async () => readyPage(document.hash, 1)) }
    const service = new DocumentAnalysisService(store, parser, {
      engineInstalling: async () => installing,
      enginePollMs: 20,
    })

    try {
      await service.schedule(document.id)
      await vi.waitFor(() =>
        expect(service.snapshot().jobs.find((job) => job.id === document.id)?.state).toBe("queued"),
      )
      await service.forget(document.id)
      installing = false
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(parser.parse).not.toHaveBeenCalled()
      expect(service.snapshot().jobs).toEqual([])
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
