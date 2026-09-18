// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { DocumentAnalysisService } from "../../src/electron/documentAnalysisService"
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
    const service = new DocumentAnalysisService(store, parser, { maxConcurrency: 1 })

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
    expect(service.snapshot().every((job) => job.state !== "complete")).toBe(true)
    expect(JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8"))).toEqual({
      version: 1,
      documentIds: expect.arrayContaining([first.id, second.id]),
    })
    await store.close()
    await rm(root, { recursive: true, force: true })
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
    const service = new DocumentAnalysisService(store, parser)

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
      expect(service.snapshot()).toHaveLength(2)
      expect(service.snapshot().every((job) => job.state === "running")).toBe(true)

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
      await vi.waitFor(() =>
        expect(service.snapshot().every((job) => job.state === "complete")).toBe(true),
      )
      expect(
        JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8")),
      ).toEqual({
        version: 1,
        documentIds: [],
      })
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

    const service = new DocumentAnalysisService(store, parser, { maxConcurrency: 1 })

    try {
      await Promise.all([service.schedule(first.id), service.schedule(second.id)])

      await vi.waitFor(() => {
        const snap = service.snapshot()
        const firstJob = snap.find((j) => j.id === first.id)
        const secondJob = snap.find((j) => j.id === second.id)
        expect(firstJob?.state).toBe("failed")
        expect(secondJob?.state).toBe("complete")
      })

      expect(executionOrder).toEqual([`${first.id}:1`, `${second.id}:1`, `${second.id}:2`])

      await service.schedule(first.id)
      const snapAfter = service.snapshot()
      const firstJobAfter = snapAfter.find((j) => j.id === first.id)
      expect(["queued", "running", "failed"]).toContain(firstJobAfter?.state)
    } finally {
      await service.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("does not retry failed jobs on restart and allows deliberate reschedule", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-analysis-fail-restart-"))
    const store = new WorkspaceStore(root)
    const failDoc = record("e", "Failed paper")
    await store.save({ ...defaultWorkspace(), documents: [failDoc] })

    let parseAttempts = 0
    const parser = {
      parse: vi.fn(async () => {
        parseAttempts += 1
        if (parseAttempts === 1) {
          return { status: "unavailable" as const, reason: "runtime_missing" as const }
        }
        return readyPage(failDoc.hash, 1)
      }),
    }

    const service1 = new DocumentAnalysisService(store, parser, { maxConcurrency: 0 })
    await service1.schedule(failDoc.id)
    await vi.waitFor(() => {
      const job = service1.snapshot().find((j) => j.id === failDoc.id)
      expect(job?.state).toBe("failed")
    })
    await service1.dispose()

    // Verify pending queue file does not contain failed job
    const queueFile = JSON.parse(await readFile(join(root, "document-analysis-queue.json"), "utf8"))
    expect(queueFile.documentIds).not.toContain(failDoc.id)

    // Reopen service - resumePending should not restart inference for the failed job
    const service2 = new DocumentAnalysisService(store, parser)
    await service2.resumePending()
    expect(parseAttempts).toBe(1)
    expect(service2.snapshot()).toHaveLength(0)

    // Explicit reschedule works
    await service2.reschedule(failDoc.id)
    await vi.waitFor(() => {
      expect(parseAttempts).toBeGreaterThan(1)
    })
    await service2.dispose()
    await rm(root, { recursive: true, force: true })
  })
})
