// @vitest-environment node

import { access, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanDerivedCaches,
  currentAstFingerprint,
  MISTRAL_PAGE_CACHE_VERSION,
  PADDLE_PAGE_CACHE_VERSION,
} from "../../src/electron/derivedCacheCleanup"
import { DocumentAstService } from "../../src/electron/documentAstService"
import { DocumentAstStore } from "../../src/electron/documentAstStore"
import { createDocumentPageParser } from "../../src/electron/documentPageParser"
import { HYBRID_PAGE_CACHE_VERSION } from "../../src/electron/hybridPageParser"
import { PaddlePageParserService } from "../../src/electron/paddlePageParserService"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { scheduleDerivedCacheCleanup } from "../../src/server/derivedCacheCleanupTask"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"
import {
  type DocumentRecord,
  documentIdSchema,
  documentRecordSchema,
  sha256Schema,
} from "../../src/shared/schemas"

const HOUR = 60 * 60_000
const library = sha256Schema.parse("a".repeat(64))
const orphan = sha256Schema.parse("b".repeat(64))
const importing = sha256Schema.parse("c".repeat(64))
const libraryId = documentIdSchema.parse("a".repeat(16))
const orphanId = documentIdSchema.parse("b".repeat(16))
const staleFingerprint = "f".repeat(64)

function paper(): DocumentRecord {
  return documentRecordSchema.parse({
    id: libraryId,
    name: "paper.pdf",
    hash: library,
    bytes: 100,
    importedAt: "2026-09-03T00:00:00.000Z",
    pageCount: 1,
    title: "Paper",
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

function page(content: string): string {
  return JSON.stringify(
    parsedDocumentPageSchema.parse({
      schemaVersion: "1.0.0",
      sourceHash: library,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v3",
      pageNumber: 1,
      width: 100,
      height: 100,
      blocks: [
        {
          id: "page:1:block:0",
          label: "text",
          order: 0,
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          content,
          contentFormat: "text",
          translationPolicy: "include",
        },
      ],
    }),
  )
}

let root = ""
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "derived-cache-cleanup-"))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

async function put(path: string, content = "{}"): Promise<string> {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

async function exists(path: string): Promise<boolean> {
  return access(join(root, path)).then(
    () => true,
    () => false,
  )
}

/** Marks `path` as changed a minute before the cleanup's clock, i.e. by a writer at work. */
async function touchRecently(path: string, clock: number): Promise<void> {
  const recent = new Date(clock - 60_000)
  await utimes(join(root, path), recent, recent)
}

describe("cleanDerivedCaches", () => {
  it("removes stale versions and orphaned caches but never translations of library papers", async () => {
    const current = currentAstFingerprint(library)
    const kept = [
      `parsed-pages/${library}/${HYBRID_PAGE_CACHE_VERSION}/page-1.json`,
      `parsed-pages/${library}/${PADDLE_PAGE_CACHE_VERSION}/page-1.json`,
      `parsed-pages/${library}/${MISTRAL_PAGE_CACHE_VERSION}/page-1.json`,
      `parsed-pages/not-a-hash/old/page-1.json`,
      `document-ast/${library}/${current}.json`,
      `document-ast/${library}/${current}.semantic.json`,
      `document-ast/${library}/notes.txt`,
      `page-translations/${library}/${"1".repeat(64)}/page-1.json`,
      `layout/${libraryId}.json`,
      `citations/${"2".repeat(64)}.json`,
      `documents/${orphan}.pdf`,
      "knowledge.sqlite",
      "notes/reading.md",
    ]
    const removed = [
      `parsed-pages/${library}/pdfjs-paddleocr-vl-1.6-hybrid-v12`,
      `parsed-pages/${orphan}`,
      `document-ast/${library}/${staleFingerprint}.json`,
      `document-ast/${library}/${staleFingerprint}.semantic.json`,
      `document-ast/${library}/${current}.json.0f9d.tmp`,
      `document-ast/${orphan}`,
      `page-translations/${orphan}`,
      `layout/${orphanId}.json`,
    ]
    for (const path of kept) await put(path)
    await put(`parsed-pages/${library}/pdfjs-paddleocr-vl-1.6-hybrid-v12/page-1.json`)
    await put(`parsed-pages/${orphan}/${HYBRID_PAGE_CACHE_VERSION}/page-1.json`)
    await put(`document-ast/${library}/${staleFingerprint}.json`)
    await put(`document-ast/${library}/${staleFingerprint}.semantic.json`)
    await put(`document-ast/${library}/${current}.json.0f9d.tmp`)
    await put(`document-ast/${orphan}/${staleFingerprint}.json`)
    await put(`page-translations/${orphan}/${"1".repeat(64)}/page-1.json`)
    await put(`layout/${orphanId}.json`)
    // Written within the last ten minutes: a parser, an import or an old build may be at work.
    const clock = Date.now() + HOUR
    const recent = [
      `parsed-pages/${library}/pdfjs-paddleocr-vl-1.6-hybrid-v11`,
      `parsed-pages/${importing}`,
      `document-ast/${importing}`,
    ]
    await put(`parsed-pages/${library}/pdfjs-paddleocr-vl-1.6-hybrid-v11/page-1.json`)
    await put(`parsed-pages/${importing}/${HYBRID_PAGE_CACHE_VERSION}/page-1.json`)
    await put(`document-ast/${importing}/${staleFingerprint}.json`)
    await touchRecently(`parsed-pages/${library}/pdfjs-paddleocr-vl-1.6-hybrid-v11`, clock)
    await touchRecently(`parsed-pages/${importing}/${HYBRID_PAGE_CACHE_VERSION}`, clock)
    await touchRecently(`document-ast/${importing}`, clock)
    // A linked folder is never followed nor removed.
    const outside = await mkdtemp(join(tmpdir(), "derived-cache-outside-"))
    await writeFile(join(outside, "keep.json"), "{}")
    await symlink(outside, join(root, "parsed-pages", "d".repeat(64)))

    try {
      const result = await cleanDerivedCaches({
        root,
        isLibraryHash: (hash) => hash === library,
        isLibraryDocument: (id) => id === libraryId,
        signal: new AbortController().signal,
        now: () => clock,
      })

      expect(result).toEqual({ removed: removed.length, failed: 0, complete: true })
      for (const path of [...kept, ...recent]) expect(await exists(path)).toBe(true)
      for (const path of removed) expect(await exists(path)).toBe(false)
      await expect(access(join(outside, "keep.json"))).resolves.toBeUndefined()
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("stops without removing anything once aborted", async () => {
    await put(`parsed-pages/${orphan}/${HYBRID_PAGE_CACHE_VERSION}/page-1.json`)
    const controller = new AbortController()
    controller.abort()

    const result = await cleanDerivedCaches({
      root,
      isLibraryHash: () => false,
      isLibraryDocument: () => false,
      signal: controller.signal,
      now: () => Date.now() + HOUR,
    })

    expect(result).toEqual({ removed: 0, failed: 0, complete: false })
    expect(await exists(`parsed-pages/${orphan}`)).toBe(true)
  })

  it("keeps exactly the caches the current parsers and AST reader use", async () => {
    const store = new WorkspaceStore(root)
    const document = paper()
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const paddle = new PaddlePageParserService({
      appPath: root,
      resourcesPath: root,
      packaged: false,
      home: root,
    })
    const asked: string[] = []
    class RecordingAstStore extends DocumentAstStore {
      override async read(sourceHash: string, fingerprint: string) {
        asked.push(fingerprint)
        return super.read(sourceHash, fingerprint)
      }
    }

    try {
      await put(`parsed-pages/${library}/${PADDLE_PAGE_CACHE_VERSION}/page-1.json`, page("paddle"))
      const paddlePage = await paddle.readCached(document, 1, store)
      expect(paddlePage?.blocks[0]?.content).toBe("paddle")

      await put(
        `parsed-pages/${library}/${MISTRAL_PAGE_CACHE_VERSION}/page-1.json`,
        page("mistral"),
      )
      const pages = createDocumentPageParser({ store, paddlePageParser: { parse: vi.fn() } })
      const parsed = await pages.parse({ documentId: document.id, pageNumber: 1 })
      expect(parsed.status === "ready" && parsed.page.blocks[0]?.content).toBe("mistral")

      const ast = new DocumentAstService(store, { store: new RecordingAstStore(root) })
      await ast.request({ id: document.id })
      expect(asked).toEqual([currentAstFingerprint(library)])
    } finally {
      paddle.dispose()
      await store.close()
    }
  })
})

describe("scheduleDerivedCacheCleanup", () => {
  it("runs once after its delay and can be stopped before it starts", async () => {
    const store = new WorkspaceStore(root)
    await store.save({ ...defaultWorkspace(), documents: [paper()] })
    const orphanPages = `parsed-pages/${orphan}/${HYBRID_PAGE_CACHE_VERSION}`
    await put(`${orphanPages}/page-1.json`)
    const longAgo = new Date(Date.now() - HOUR)
    for (const path of [`${orphanPages}/page-1.json`, orphanPages, `parsed-pages/${orphan}`])
      await utimes(join(root, path), longAgo, longAgo)

    try {
      await scheduleDerivedCacheCleanup(store, 60_000).stop()
      expect(await exists(`parsed-pages/${orphan}`)).toBe(true)

      const cleanup = scheduleDerivedCacheCleanup(store, 0)
      await vi.waitFor(async () => expect(await exists(`parsed-pages/${orphan}`)).toBe(false))
      await cleanup.stop()
    } finally {
      await store.close()
    }
  })
})
