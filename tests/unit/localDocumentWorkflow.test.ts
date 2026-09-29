import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { buildScannedMixedPdf } from "../../scripts/document-fixtures/scanned-pdf"
import { buildStructuredPdf } from "../../scripts/document-fixtures/structured-pdf"
import { DocumentAnalysisService } from "../../src/electron/documentAnalysisService"
import { importPaths } from "../../src/electron/documentImportIpc"
import { createDocumentPageParser } from "../../src/electron/documentPageParser"
import {
  HYBRID_PAGE_CACHE_VERSION,
  HYBRID_PAGE_CONFIG_VERSION,
} from "../../src/electron/hybridPageParser"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"
import type { DocumentRecord } from "../../src/shared/schemas"

function paddlePage(document: DocumentRecord, pageNumber = 1) {
  return parsedDocumentPageSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash: document.hash,
    parser: "PaddleOCR-VL-1.6",
    configVersion: "page-v3",
    pageNumber,
    width: 1_200,
    height: 1_600,
    blocks: [
      {
        id: `page:${pageNumber}:block:0`,
        label: "table",
        order: 0,
        bounds: { x: 100, y: 900, width: 1_000, height: 300 },
        content: "<table><tr><td>39.92</td></tr></table>",
        contentFormat: "html",
        translationPolicy: "exclude",
      },
    ],
  })
}

async function importFixture(
  root: string,
  store: WorkspaceStore,
  name: string,
  bytes: Uint8Array,
): Promise<DocumentRecord> {
  const pdfPath = join(root, name)
  await writeFile(pdfPath, bytes)
  const fakeEvent = { sender: { send: vi.fn() } }
  const dummyAnalysis = { schedule: vi.fn(async () => undefined) }
  const [imported] = await importPaths(fakeEvent, [pdfPath], dummyAnalysis, store)
  if (!imported) throw new Error("Import failed")
  return imported.document
}

function parserResult(
  parser: ReturnType<typeof createDocumentPageParser>,
  document: DocumentRecord,
  pageNumber: number,
) {
  return parser.parse({ documentId: document.id, pageNumber })
}

describe("local document workflow", () => {
  it("starts bounded Paddle preparation immediately after importing a scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-local-workflow-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const paddleParse = vi.fn().mockResolvedValue({
        status: "unavailable",
        reason: "runtime_missing",
      })
      const pdfPath = join(root, "scanned.pdf")
      await writeFile(pdfPath, await buildScannedMixedPdf())
      const analysis = new DocumentAnalysisService(
        store,
        createDocumentPageParser({ store, paddlePageParser: { parse: paddleParse } }),
        { pageConcurrency: 1 },
      )

      const imported = await importPaths({ sender: { send: vi.fn() } }, [pdfPath], analysis, store)

      expect(imported).toHaveLength(1)
      await vi.waitFor(() =>
        expect(
          analysis.snapshot().jobs.find((job) => job.id === imported[0]?.document.id)?.state,
        ).toBe("failed"),
      )
      await analysis.dispose()
      expect(paddleParse).toHaveBeenCalledTimes(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("merges PDF.js text with Paddle structures for a digital page", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-hybrid-parse-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const document = await importFixture(
        root,
        store,
        "structured.pdf",
        await buildStructuredPdf(),
      )
      const paddleParse = vi.fn().mockResolvedValue({
        status: "ready",
        page: paddlePage(document),
      })
      const parser = createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse },
      })

      const result = await parser.parse({
        documentId: document.id,
        pageNumber: 1,
        requireStructuredOcr: true,
      })

      expect(result.status).toBe("ready")
      if (result.status === "ready") {
        expect(result.page.parser).toBe("PDF.js+PaddleOCR-VL-1.6")
        expect(result.page.blocks.some((block) => block.label === "table")).toBe(true)
        expect(result.page.blocks.some((block) => block.label === "text")).toBe(true)
      }
      expect(paddleParse).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("uses the complete Paddle page when the PDF has no usable text", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-scan-parse-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const document = await importFixture(root, store, "scanned.pdf", await buildScannedMixedPdf())
      const page = paddlePage(document)
      const paddleParse = vi.fn().mockResolvedValue({ status: "ready", page })
      const parser = createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse },
      })

      const result = await parser.parse({ documentId: document.id, pageNumber: 1 })

      expect(result).toEqual({ status: "ready", page })
      expect(paddleParse).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("reuses the hybrid cache and rejects invalid page numbers", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-hybrid-cache-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const document = await importFixture(
        root,
        store,
        "structured.pdf",
        await buildStructuredPdf(),
      )
      const paddleParse = vi.fn().mockResolvedValue({
        status: "ready",
        page: paddlePage(document),
      })
      const firstParser = createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse },
      })
      const initial = await firstParser.parse({
        documentId: document.id,
        pageNumber: 1,
        requireStructuredOcr: true,
      })
      expect(initial.status).toBe("ready")

      const reopenedParser = createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse },
      })
      const reopened = await reopenedParser.parse({ documentId: document.id, pageNumber: 1 })

      expect(reopened.status).toBe("ready")
      if (reopened.status === "ready") {
        expect(reopened.page.parser).toBe("PDF.js+PaddleOCR-VL-1.6")
      }
      expect(paddleParse).toHaveBeenCalledOnce()
      if (reopened.status === "ready") {
        expect(reopened.page.layout?.map((block) => block.label)).toEqual(["table"])
      }
      for (const pageNumber of [0, -1, 1.5]) {
        await expect(parserResult(reopenedParser, document, pageNumber)).resolves.toEqual({
          status: "unavailable",
          reason: "invalid_page",
        })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("gives a hybrid page cached before layouts existed its layout from Paddle's cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-hybrid-layout-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const document = await importFixture(
        root,
        store,
        "structured.pdf",
        await buildStructuredPdf(),
      )
      const paddleParse = vi.fn().mockResolvedValue({ status: "ready", page: paddlePage(document) })
      await createDocumentPageParser({ store, paddlePageParser: { parse: paddleParse } }).parse({
        documentId: document.id,
        pageNumber: 1,
        requireStructuredOcr: true,
      })
      const cacheFile = join(
        root,
        "parsed-pages",
        document.hash,
        HYBRID_PAGE_CACHE_VERSION,
        "page-1.json",
      )
      const { layout: _layout, ...withoutLayout } = JSON.parse(await readFile(cacheFile, "utf8"))
      await writeFile(cacheFile, JSON.stringify(withoutLayout))
      const readCached = vi.fn().mockResolvedValue(paddlePage(document))

      const reopened = await createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse, readCached },
      }).parse({ documentId: document.id, pageNumber: 1 })

      expect(reopened.status).toBe("ready")
      if (reopened.status === "ready") {
        expect(reopened.page.configVersion).toBe(HYBRID_PAGE_CONFIG_VERSION)
        expect(reopened.page.layout).toEqual([
          {
            label: "table",
            order: 0,
            bounds: { x: 100, y: 900, width: 1_000, height: 300 },
            content: "<table><tr><td>39.92</td></tr></table>",
          },
        ])
      }
      expect(paddleParse).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("builds the hybrid page from Paddle's cache at once instead of handing out PDF.js first", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-hybrid-rebuild-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const document = await importFixture(
        root,
        store,
        "structured.pdf",
        await buildStructuredPdf(),
      )
      const paddleParse = vi.fn()
      const readCached = vi.fn().mockResolvedValue(paddlePage(document))
      const parser = createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse, readCached },
      })

      const first = await parser.parse({ documentId: document.id, pageNumber: 1 })
      const prepared = await parser.parse({
        documentId: document.id,
        pageNumber: 1,
        preparedOnly: true,
      })

      expect(first.status === "ready" && first.page.parser).toBe("PDF.js+PaddleOCR-VL-1.6")
      expect(prepared.status === "ready" && prepared.page.configVersion).toBe(
        HYBRID_PAGE_CONFIG_VERSION,
      )
      expect(paddleParse).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("gives a translation the structured page even while a prepared-only look runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-await-structure-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())
      const document = await importFixture(
        root,
        store,
        "structured.pdf",
        await buildStructuredPdf(),
      )
      let finishOcr: () => void = () => {}
      const ocrDone = new Promise<void>((resolve) => {
        finishOcr = resolve
      })
      const paddleParse = vi.fn(async () => {
        await ocrDone
        return { status: "ready" as const, page: paddlePage(document) }
      })
      const parser = createDocumentPageParser({
        store,
        paddlePageParser: { parse: paddleParse, readCached: vi.fn().mockResolvedValue(null) },
      })

      // The viewer's look at what is already parsed, as the translation pane opens.
      const prepared = parser.parse({ documentId: document.id, pageNumber: 1, preparedOnly: true })
      const translation = parser.parse({
        documentId: document.id,
        pageNumber: 1,
        awaitStructure: true,
      })
      const reader = await parser.parse({ documentId: document.id, pageNumber: 1 })
      finishOcr()

      expect(await prepared).toEqual({ status: "unavailable", reason: "needs_ocr" })
      // A reader may start from the PDF.js text; the translation waits for the structure.
      expect(reader.status === "ready" && reader.page.parser).toBe("NativeText-1.0")
      const translated = await translation
      expect(translated.status === "ready" && translated.page.parser).toBe(
        "PDF.js+PaddleOCR-VL-1.6",
      )
      expect(paddleParse).toHaveBeenCalledTimes(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
