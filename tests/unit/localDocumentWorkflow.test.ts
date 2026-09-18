import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { buildScannedMixedPdf } from "../../scripts/document-fixtures/scanned-pdf"
import { buildStructuredPdf } from "../../scripts/document-fixtures/structured-pdf"
import { DocumentAnalysisService } from "../../src/electron/documentAnalysisService"
import { importPaths } from "../../src/electron/documentImportIpc"
import { createDocumentPageParser } from "../../src/electron/documentPageParser"
import { MistralPageParserService } from "../../src/electron/mistralPageParserService"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"

describe("local document workflow", () => {
  it("does not trigger local or remote OCR while importing a scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-local-workflow-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())

      const mockProcess = vi.fn()
      const paddleParse = vi.fn().mockResolvedValue({
        status: "unavailable",
        reason: "runtime_missing",
      })
      const ocrCredentials = { apiKey: async () => "mistral-valid-key-at-least-20-chars" }
      const pdfBytes = await buildScannedMixedPdf()
      const pdfPath = join(root, "scanned.pdf")
      await writeFile(pdfPath, pdfBytes)

      const fakeEvent = {
        sender: {
          send: vi.fn(),
        },
      }

      const analysis = new DocumentAnalysisService(
        store,
        createDocumentPageParser({
          store,
          paddlePageParser: { parse: paddleParse },
          mistralPageParser: new MistralPageParserService(ocrCredentials, {
            process: mockProcess,
          }),
          ocrCredentials,
        }),
      )

      const imported = await importPaths(fakeEvent, [pdfPath], analysis, store)
      expect(imported).toHaveLength(1)
      await analysis.dispose()
      expect(paddleParse).not.toHaveBeenCalled()
      expect(mockProcess).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("routes page parsing locally without invoking Mistral even if Mistral key is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-local-parse-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())

      const mockProcess = vi.fn()
      const mockOcrCredentials = {
        apiKey: async () => "mistral-valid-key-at-least-20-chars",
      }
      const mistralService = new MistralPageParserService(mockOcrCredentials, {
        process: mockProcess,
      })

      const pdfBytes = await buildStructuredPdf()
      const pdfPath = join(root, "structured.pdf")
      await writeFile(pdfPath, pdfBytes)

      const fakeEvent = { sender: { send: vi.fn() } }
      const dummyAnalysis = { schedule: vi.fn(async () => undefined) }
      const [imported] = await importPaths(fakeEvent, [pdfPath], dummyAnalysis, store)
      if (!imported) throw new Error("Import failed")

      const { createDocumentPageParser } = await import("../../src/electron/documentPageParser")
      const pageParser = createDocumentPageParser({
        store,
        paddlePageParser: {
          parse: vi.fn().mockResolvedValue({ status: "unavailable", reason: "runtime_missing" }),
        },
        mistralPageParser: mistralService,
        ocrCredentials: mockOcrCredentials,
      })

      const result = await pageParser.parse({
        documentId: imported.document.id,
        pageNumber: 1,
        store,
      })
      expect(result.status).toBe("ready")
      if (result.status === "ready") {
        expect(result.page.parser).toBe("NativeText-1.0")
      }
      expect(mockProcess).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("returns needs_ocr status for scan-only page without calling Mistral automatically", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-scan-parse-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())

      const mockProcess = vi.fn()
      const mockOcrCredentials = { apiKey: async () => "mistral-valid-key-at-least-20-chars" }
      const mistralService = new MistralPageParserService(mockOcrCredentials, {
        process: mockProcess,
      })
      const pdfBytes = await buildScannedMixedPdf()
      const pdfPath = join(root, "scanned.pdf")
      await writeFile(pdfPath, pdfBytes)
      const fakeEvent = { sender: { send: vi.fn() } }
      const dummyAnalysis = { schedule: vi.fn(async () => undefined) }
      const [imported] = await importPaths(fakeEvent, [pdfPath], dummyAnalysis, store)
      if (!imported) throw new Error("Import failed")

      const { createDocumentPageParser } = await import("../../src/electron/documentPageParser")
      const pageParser = createDocumentPageParser({
        store,
        paddlePageParser: {
          parse: vi.fn().mockResolvedValue({ status: "unavailable", reason: "runtime_missing" }),
        },
        mistralPageParser: mistralService,
        ocrCredentials: mockOcrCredentials,
      })

      const result = await pageParser.parse({
        documentId: imported.document.id,
        pageNumber: 1,
        store,
      })
      expect(result.status).toBe("unavailable")
      if (result.status === "unavailable") {
        expect(["runtime_missing", "needs_ocr"]).toContain(result.reason)
      }
      expect(mockProcess).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("honors forceOcr by bypassing native cache and calling OCR, and rejects invalid page numbers", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-force-ocr-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save(defaultWorkspace())

      const mockProcess = vi.fn().mockResolvedValue({
        model: "mistral-ocr-latest",
        usage_info: { pages_processed: 3, doc_size_bytes: 1000 },
        pages: [
          {
            index: 0,
            markdown: "OCR extracted text",
            dimensions: { width: 600, height: 800 },
            blocks: [
              {
                type: "text",
                content: "OCR extracted text",
                top_left_x: 50,
                top_left_y: 50,
                bottom_right_x: 300,
                bottom_right_y: 100,
              },
            ],
          },
          {
            index: 1,
            markdown: "OCR extracted text page 2",
            dimensions: { width: 600, height: 800 },
            blocks: [
              {
                type: "text",
                content: "OCR extracted text page 2",
                top_left_x: 50,
                top_left_y: 50,
                bottom_right_x: 300,
                bottom_right_y: 100,
              },
            ],
          },
          {
            index: 2,
            markdown: "OCR extracted text page 3",
            dimensions: { width: 600, height: 800 },
            blocks: [
              {
                type: "text",
                content: "OCR extracted text page 3",
                top_left_x: 50,
                top_left_y: 50,
                bottom_right_x: 300,
                bottom_right_y: 100,
              },
            ],
          },
        ],
      })
      const mockOcrCredentials = { apiKey: async () => "mistral-valid-key-at-least-20-chars" }
      const mistralService = new MistralPageParserService(mockOcrCredentials, {
        process: mockProcess,
      })
      const pdfBytes = await buildStructuredPdf()
      const pdfPath = join(root, "structured.pdf")
      await writeFile(pdfPath, pdfBytes)

      const fakeEvent = { sender: { send: vi.fn() } }
      const dummyAnalysis = { schedule: vi.fn(async () => undefined) }
      const [imported] = await importPaths(fakeEvent, [pdfPath], dummyAnalysis, store)
      if (!imported) throw new Error("Import failed")

      const { createDocumentPageParser } = await import("../../src/electron/documentPageParser")
      const pageParser = createDocumentPageParser({
        store,
        paddlePageParser: {
          parse: vi.fn().mockResolvedValue({ status: "unavailable", reason: "runtime_missing" }),
        },
        mistralPageParser: mistralService,
        ocrCredentials: mockOcrCredentials,
      })

      // Normal parse populates native cache
      const initial = await pageParser.parse({
        documentId: imported.document.id,
        pageNumber: 1,
        store,
      })
      expect(initial.status).toBe("ready")
      if (initial.status === "ready") {
        expect(initial.page.parser).toBe("NativeText-1.0")
      }
      expect(mockProcess).not.toHaveBeenCalled()

      // forceOcr must trigger Mistral OCR despite native cache presence
      const forced = await pageParser.parse({
        documentId: imported.document.id,
        pageNumber: 1,
        store,
        forceOcr: true,
      })
      expect(forced.status).toBe("ready")
      if (forced.status === "ready") {
        expect(forced.page.parser).toBe("Mistral-OCR-4.1")
      }
      expect(mockProcess).toHaveBeenCalledTimes(1)

      const afterOcr = await pageParser.parse({
        documentId: imported.document.id,
        pageNumber: 1,
        store,
      })
      expect(afterOcr.status).toBe("ready")
      if (afterOcr.status === "ready") {
        expect(afterOcr.page.parser).toBe("Mistral-OCR-4.1")
        expect(afterOcr.page.blocks[0]?.content).toBe("OCR extracted text")
      }

      // Invalid page numbers (<= 0 or non-integer) must be rejected with invalid_page
      expect(
        await pageParser.parse({ documentId: imported.document.id, pageNumber: 0, store }),
      ).toEqual({
        status: "unavailable",
        reason: "invalid_page",
      })
      expect(
        await pageParser.parse({ documentId: imported.document.id, pageNumber: -1, store }),
      ).toEqual({
        status: "unavailable",
        reason: "invalid_page",
      })
      expect(
        await pageParser.parse({ documentId: imported.document.id, pageNumber: 1.5, store }),
      ).toEqual({
        status: "unavailable",
        reason: "invalid_page",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
