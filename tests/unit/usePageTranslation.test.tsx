import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePageTranslation } from "../../src/renderer/lib/usePageTranslation"
import { PaperAiJobError } from "../../src/renderer/lib/usePaperAiRequest"
import type { DocumentRecord } from "../../src/renderer/types"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"
import { providerStatusSchema } from "../../src/shared/ipc"
import { documentRecordSchema } from "../../src/shared/schemas"

const testDoc: DocumentRecord = documentRecordSchema.parse({
  id: "1122334455667788",
  name: "doc.pdf",
  hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  bytes: 1024,
  importedAt: "2026-09-01T00:00:00.000Z",
  pageCount: 3,
  title: "Test Doc",
  authors: [],
  year: null,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 500, needsOcr: false, warnings: [] },
})

const configuredProvider = providerStatusSchema.parse({
  provider: "openai",
  model: "gpt-4o",
  configured: true,
})

const emptyCitations: [] = []

// Create a page with 2 long paragraphs so that pageTranslationBatches splits them into 2 batches
const mockParsedPage = parsedDocumentPageSchema.parse({
  schemaVersion: "1.0.0",
  sourceHash: "b".repeat(64),
  parser: "PaddleOCR-VL-1.6",
  configVersion: "page-v1",
  pageNumber: 1,
  width: 1_000,
  height: 1_000,
  blocks: [
    {
      id: "page:1:block:0",
      label: "text",
      order: 0,
      bounds: { x: 50, y: 80, width: 400, height: 100 },
      // Long enough to exceed chunk limit when combined
      content: "Paragraph one sentence one. ".repeat(150),
      contentFormat: "markdown",
      translationPolicy: "include",
    },
    {
      id: "page:1:block:1",
      label: "text",
      order: 1,
      bounds: { x: 50, y: 500, width: 400, height: 100 },
      content: "Paragraph two sentence two. ".repeat(150),
      contentFormat: "markdown",
      translationPolicy: "include",
    },
  ],
})

const mockWriteCache = vi.fn(async () => {})

Object.defineProperty(window, "ohmypaper", {
  value: {
    onDocumentPageParseProgress: vi.fn(() => () => {}),
    parseDocumentPage: vi.fn(async () => ({ status: "ready" as const, page: mockParsedPage })),
    readPageTranslationCache: vi.fn(async () => ({ status: "missing" as const })),
    writePageTranslationCache: mockWriteCache,
    clearPageTranslationCache: vi.fn(async () => {}),
  },
  configurable: true,
  writable: true,
})

describe("usePageTranslation partial results and cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, "ohmypaper", {
      value: {
        onDocumentPageParseProgress: vi.fn(() => () => {}),
        parseDocumentPage: vi.fn(async () => ({ status: "ready" as const, page: mockParsedPage })),
        readPageTranslationCache: vi.fn(async () => ({ status: "missing" as const })),
        writePageTranslationCache: mockWriteCache,
        clearPageTranslationCache: vi.fn(async () => {}),
      },
      configurable: true,
      writable: true,
    })
  })

  it("retains successful partial batch output when a later batch fails", async () => {
    let callCount = 0
    const onAiRequest = vi.fn(async (req) => {
      callCount += 1
      const requestData = JSON.parse(req.quote) as { blocks: Array<{ id: string }> }
      if (callCount === 1) {
        return JSON.stringify({
          translations: requestData.blocks.map((b) => ({
            id: b.id,
            markdown: `번역됨: ${b.id}`,
          })),
        })
      }
      throw new Error("Batch 2 provider error")
    })

    const { result } = renderHook(() =>
      usePageTranslation({
        document: testDoc,
        currentPage: 1,
        citations: emptyCitations,
        provider: configuredProvider,
        onAiRequest,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe("failed")
    })

    // Batch 1 translation must NOT be lost!
    const translatedBlocks = result.current.blocks.filter((b) => b.translation.trim().length > 0)
    expect(translatedBlocks.length).toBeGreaterThan(0)

    // Incomplete output must NEVER be marked complete or cached
    expect(result.current.status).not.toBe("complete")
    expect(mockWriteCache).not.toHaveBeenCalled()
    // An analysed page is asked for first and never waited for.
    expect(window.ohmypaper.parseDocumentPage).toHaveBeenCalledWith(
      { id: testDoc.id, pageNumber: 1, preparedOnly: true },
      expect.any(AbortSignal),
    )
    expect(window.ohmypaper.parseDocumentPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ awaitStructure: true }),
      expect.anything(),
    )
  })

  it("translates from the PDF's own text at once when the page is not analysed yet", async () => {
    const unanalysed = documentRecordSchema.parse({ ...testDoc, id: "aabbccddeeff0099" })
    const parse = vi.fn(async (request: { readonly preparedOnly?: boolean }) =>
      request.preparedOnly
        ? { status: "unavailable" as const, reason: "needs_ocr" as const }
        : { status: "ready" as const, page: mockParsedPage },
    )
    Object.defineProperty(window, "ohmypaper", {
      value: { ...window.ohmypaper, parseDocumentPage: parse },
      configurable: true,
      writable: true,
    })
    const onAiRequest = vi.fn(async (req: { readonly quote: string }) => {
      const requestData = JSON.parse(req.quote) as { blocks: Array<{ id: string }> }
      return JSON.stringify({
        translations: requestData.blocks.map((b) => ({ id: b.id, markdown: `번역됨: ${b.id}` })),
      })
    })

    const { result } = renderHook(() =>
      usePageTranslation({
        document: unanalysed,
        currentPage: 1,
        citations: emptyCitations,
        provider: configuredProvider,
        onAiRequest,
      }),
    )

    await waitFor(() => expect(result.current.status).toBe("complete"))
    expect(parse.mock.calls.map(([request]) => request)).toEqual([
      { id: unanalysed.id, pageNumber: 1, preparedOnly: true },
      { id: unanalysed.id, pageNumber: 1 },
    ])
  })

  it("tells the reader why the page failed and clears the reason on retry", async () => {
    const onAiRequest = vi.fn(
      async (_request: unknown, _onDelta: unknown, _signal?: AbortSignal): Promise<string> => {
        throw new PaperAiJobError("timeout")
      },
    )

    const { result, unmount } = renderHook(() =>
      usePageTranslation({
        document: testDoc,
        currentPage: 1,
        citations: emptyCitations,
        provider: configuredProvider,
        onAiRequest,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe("failed")
    })
    expect(result.current.failure).toBe("AI 응답이 제한 시간 안에 오지 않았습니다.")

    // Pending until the hook aborts it, as a real request is, so no translation slot is kept.
    const pending = (_request: unknown, _onDelta: unknown, signal?: AbortSignal) =>
      new Promise<string>((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new PaperAiJobError("cancelled"))),
      )
    onAiRequest.mockImplementation(pending)
    await act(() => result.current.regenerate())

    await waitFor(() => {
      expect(result.current.status).toBe("streaming")
    })
    expect(result.current.failure).toBeNull()
    unmount()
  })

  it("aborts in-flight translation and prevents stale updates on unmount", async () => {
    let unblockAi: () => void = () => {}
    let capturedSignal: AbortSignal | undefined

    const onAiRequest = vi.fn(async (_req, _onDelta, signal) => {
      capturedSignal = signal
      return new Promise<string>((resolve) => {
        unblockAi = () =>
          resolve(
            JSON.stringify({
              translations: [{ id: "page:1:block:0:sentence:1", markdown: "번역 완료" }],
            }),
          )
      })
    })

    const { unmount } = renderHook(() =>
      usePageTranslation({
        document: testDoc,
        currentPage: 1,
        citations: emptyCitations,
        provider: configuredProvider,
        onAiRequest,
      }),
    )

    await waitFor(() => {
      expect(onAiRequest).toHaveBeenCalled()
    })

    expect(capturedSignal?.aborted).toBe(false)
    unmount()
    expect(capturedSignal?.aborted).toBe(true)

    unblockAi()
    expect(mockWriteCache).not.toHaveBeenCalled()
  })
})
