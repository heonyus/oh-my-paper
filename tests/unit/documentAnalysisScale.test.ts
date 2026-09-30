// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DocumentAnalysisService } from "../../src/electron/documentAnalysisService"
import { DocumentAnalysisStateStore } from "../../src/electron/documentAnalysisStateStore"
import { HYBRID_PAGE_CACHE_VERSION } from "../../src/electron/hybridPageParser"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentAnalysisSnapshotSchema } from "../../src/shared/documentAnalysis"
import type { DocumentPageParseResult } from "../../src/shared/documentPageModel"
import type { DocumentId, DocumentRecord } from "../../src/shared/schemas"
import { documentRecordSchema } from "../../src/shared/schemas"

const LIBRARY_SIZE = 70

function paper(index: number): DocumentRecord {
  return documentRecordSchema.parse({
    id: index.toString(16).padStart(16, "0"),
    name: `paper-${index}.pdf`,
    hash: index.toString(16).padStart(64, "0"),
    bytes: 100,
    importedAt: "2026-09-03T00:00:00.000Z",
    pageCount: 2,
    title: `Paper ${index}`,
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

function readyPage(document: DocumentRecord, pageNumber: number): DocumentPageParseResult {
  return {
    status: "ready",
    page: {
      schemaVersion: "1.0.0",
      sourceHash: document.hash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber,
      width: 100,
      height: 100,
      blocks: [],
    },
  }
}

async function library(size: number) {
  const root = await mkdtemp(join(tmpdir(), "document-analysis-scale-"))
  const store = new WorkspaceStore(root)
  const papers = Array.from({ length: size }, (_, index) => paper(index + 1))
  await store.save({ ...defaultWorkspace(), documents: papers })
  const byId = new Map<DocumentId, DocumentRecord>(papers.map((entry) => [entry.id, entry]))
  const find = (id: DocumentId): DocumentRecord => {
    const found = byId.get(id)
    if (!found) throw new Error(`unknown paper ${id}`)
    return found
  }
  const queueFile = join(root, "document-analysis-queue.json")
  const cleanup = async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
  return { root, store, papers, find, queueFile, cleanup }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DocumentAnalysisService at library scale", () => {
  it("analyses more than 64 papers, lists a bounded snapshot and reloads their readiness", async () => {
    const { store, papers, find, queueFile, cleanup } = await library(LIBRARY_SIZE)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const parser = {
      parse: vi.fn(
        async (input: { readonly documentId: DocumentId; readonly pageNumber: number }) => {
          await gate
          return readyPage(find(input.documentId), input.pageNumber)
        },
      ),
    }
    const service = new DocumentAnalysisService(store, parser, {
      maxConcurrency: 4,
      pageConcurrency: 1,
    })
    // The server's event stream validates every snapshot the same way.
    const streamed = vi.fn((snapshot: unknown) => documentAnalysisSnapshotSchema.parse(snapshot))
    service.subscribe(streamed)

    try {
      // Every import schedules its paper; the 65th and later must succeed like the first.
      for (const entry of papers) await expect(service.schedule(entry.id)).resolves.toBeUndefined()
      const queued = service.snapshot()
      expect(queued.jobs).toHaveLength(64)
      expect(queued.jobs.filter((job) => job.state === "running")).toHaveLength(4)
      expect(queued.jobs.length + queued.unlisted.queued).toBe(LIBRARY_SIZE)

      release()
      await vi.waitFor(() => expect(papers.every((entry) => service.isReady(entry.id))).toBe(true))
      expect(streamed.mock.results.every((result) => result.type === "return")).toBe(true)
      expect(service.snapshot()).toEqual({
        jobs: [],
        unlisted: { queued: 0, running: 0, failed: 0 },
      })
      await service.dispose()
      const saved = JSON.parse(await readFile(queueFile, "utf8"))
      expect(saved.parserVersion).toBe(HYBRID_PAGE_CACHE_VERSION)
      expect(saved.pendingIds).toEqual([])
      expect(new Set(saved.readyIds)).toEqual(new Set(papers.map((entry) => entry.id)))

      const reopened = new DocumentAnalysisService(store, parser)
      const calls = parser.parse.mock.calls.length
      await reopened.resumePending()
      expect(papers.every((entry) => reopened.isReady(entry.id))).toBe(true)
      expect(parser.parse).toHaveBeenCalledTimes(calls)
      await reopened.dispose()
    } finally {
      await service.dispose()
      await cleanup()
    }
  })

  it("keeps importing and finishing jobs when the queue state cannot be saved", async () => {
    const { store, papers, find, cleanup } = await library(2)
    const [healthy, broken] = papers
    if (!healthy || !broken) throw new Error("papers are missing")
    vi.spyOn(DocumentAnalysisStateStore.prototype, "save").mockRejectedValue(new Error("disk full"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const parser = {
      parse: vi.fn(
        async (input: { readonly documentId: DocumentId; readonly pageNumber: number }) =>
          input.documentId === broken.id
            ? { status: "unavailable" as const, reason: "runtime_missing" as const }
            : readyPage(find(input.documentId), input.pageNumber),
      ),
    }
    const service = new DocumentAnalysisService(store, parser)

    try {
      await expect(service.schedule(healthy.id)).resolves.toBeUndefined()
      await expect(service.schedule(broken.id)).resolves.toBeUndefined()
      await vi.waitFor(() => {
        expect(service.isReady(healthy.id)).toBe(true)
        expect(service.snapshot().jobs).toEqual([expect.objectContaining({ state: "failed" })])
      })
      await expect(service.dispose()).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        "[document-analysis] could not save the analysis queue",
        expect.any(Error),
      )
    } finally {
      await service.dispose()
      await cleanup()
    }
  })

  it("keeps analysing when a progress listener throws", async () => {
    const { store, papers, find, cleanup } = await library(1)
    const [only] = papers
    if (!only) throw new Error("paper is missing")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const parser = {
      parse: vi.fn(
        async (input: { readonly documentId: DocumentId; readonly pageNumber: number }) =>
          readyPage(find(input.documentId), input.pageNumber),
      ),
    }
    const service = new DocumentAnalysisService(store, parser)
    service.subscribe(() => {
      throw new Error("the event stream broke")
    })

    try {
      await expect(service.schedule(only.id)).resolves.toBeUndefined()
      await vi.waitFor(() => expect(service.isReady(only.id)).toBe(true))
    } finally {
      await service.dispose()
      await cleanup()
    }
  })

  it("resumes the unready library in one pass and one write, bounded and cancellable", async () => {
    const { store, papers, queueFile, cleanup } = await library(LIBRARY_SIZE)
    const alreadyReady = papers.slice(0, 3).map((entry) => entry.id)
    await writeFile(
      queueFile,
      JSON.stringify({
        version: 3,
        parserVersion: HYBRID_PAGE_CACHE_VERSION,
        pendingIds: [],
        readyIds: alreadyReady,
      }),
    )
    const parser = {
      parse: vi.fn(
        (input: { readonly signal: AbortSignal }) =>
          new Promise<DocumentPageParseResult>((_resolve, reject) => {
            input.signal.addEventListener("abort", () => reject(new Error("aborted")))
          }),
      ),
    }
    const saves = vi.spyOn(DocumentAnalysisStateStore.prototype, "save")
    const lookups = vi.spyOn(store, "findDocument")
    const service = new DocumentAnalysisService(store, parser, {
      maxConcurrency: 4,
      pageConcurrency: 1,
    })

    try {
      await service.resumePending()
      expect(saves).toHaveBeenCalledOnce()
      expect(lookups).not.toHaveBeenCalled()
      expect(parser.parse).toHaveBeenCalledTimes(4)
      const resumed = service.snapshot()
      expect(resumed.jobs.length + resumed.unlisted.queued).toBe(LIBRARY_SIZE - 3)

      const dropped = resumed.jobs.find((job) => job.state === "queued")
      if (!dropped) throw new Error("no queued job")
      await service.forget(dropped.id)
      const after = service.snapshot()
      expect(after.jobs.length + after.unlisted.queued).toBe(LIBRARY_SIZE - 4)

      await service.dispose()
      expect(parser.parse).toHaveBeenCalledTimes(4)
      const saved = JSON.parse(await readFile(queueFile, "utf8"))
      expect(saved.readyIds).toEqual(alreadyReady)
      expect(saved.pendingIds).toHaveLength(LIBRARY_SIZE - 4)
      expect(saved.pendingIds).not.toContain(dropped.id)
    } finally {
      await service.dispose()
      await cleanup()
    }
  })
})
