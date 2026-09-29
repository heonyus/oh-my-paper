import { afterEach, describe, expect, it, vi } from "vitest"
import {
  activeParsedDocumentPages,
  clearParsedDocumentPages,
  invalidateParsedDocumentPage,
  loadParsedDocumentPage,
  parsedDocumentPage,
} from "../../src/renderer/lib/documentPageRuntime"
import type { DocumentPageParseResult } from "../../src/shared/documentPageModel"
import { parsedDocumentPageSchema } from "../../src/shared/documentPageModel"
import { documentIdSchema } from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("aabbccddeeff0011")
const page = parsedDocumentPageSchema.parse({
  schemaVersion: "1.0.0",
  sourceHash: "d".repeat(64),
  parser: "PaddleOCR-VL-1.6",
  configVersion: "page-v1",
  pageNumber: 1,
  width: 1_000,
  height: 1_000,
  blocks: [],
})

describe("parsed document page runtime", () => {
  afterEach(() => {
    clearParsedDocumentPages(documentId)
  })

  it("shares in-flight page parsing and keeps the ready page", async () => {
    const parseDocumentPage = vi.fn(async () => ({ status: "ready", page }) as const)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })

    const [first, second] = await Promise.all([
      loadParsedDocumentPage(documentId, 1),
      loadParsedDocumentPage(documentId, 1),
    ])

    expect(parseDocumentPage).toHaveBeenCalledTimes(1)
    expect(first).toEqual(page)
    expect(second).toEqual(page)
    expect(parsedDocumentPage(documentId, 1)).toEqual(page)
    expect(activeParsedDocumentPages()).toEqual([page])
  })

  it("does not restore a stale page after the document runtime is cleared", async () => {
    const deferred: { resolve: ((result: DocumentPageParseResult) => void) | null } = {
      resolve: null,
    }
    const pending = new Promise<DocumentPageParseResult>((resolve) => {
      deferred.resolve = resolve
    })
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage: () => pending },
    })

    const loading = loadParsedDocumentPage(documentId, 1)
    clearParsedDocumentPages(documentId)
    deferred.resolve?.({ status: "ready", page })

    expect(await loading).toBeNull()
    expect(parsedDocumentPage(documentId, 1)).toBeNull()
  })

  it("turns an IPC rejection into an unavailable page instead of leaving parsing active", async () => {
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage: async () => Promise.reject(new Error("ipc disconnected")) },
    })

    await expect(loadParsedDocumentPage(documentId, 1)).resolves.toBeNull()
    expect(parsedDocumentPage(documentId, 1)).toBeNull()
  })

  it("cancels one consumer without cancelling a shared page request", async () => {
    const deferred: { resolve: ((result: DocumentPageParseResult) => void) | null } = {
      resolve: null,
    }
    const pending = new Promise<DocumentPageParseResult>((resolve) => {
      deferred.resolve = resolve
    })
    const signals: (AbortSignal | undefined)[] = []
    const parseDocumentPage = vi.fn((_request: unknown, signal?: AbortSignal) => {
      signals.push(signal)
      return pending
    })
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })
    const firstController = new AbortController()
    const first = loadParsedDocumentPage(documentId, 1, { signal: firstController.signal })
    const second = loadParsedDocumentPage(documentId, 1)
    firstController.abort(new Error("first consumer cancelled"))

    expect(signals).toHaveLength(1)
    expect(signals[0]?.aborted).toBe(false)
    await expect(first).rejects.toThrow("first consumer cancelled")
    deferred.resolve?.({ status: "ready", page })

    await expect(second).resolves.toEqual(page)
    expect(signals[0]?.aborted).toBe(true)
    expect(parseDocumentPage).toHaveBeenCalledOnce()
  })

  it("reuses an active force OCR request for repeated consumers", async () => {
    const deferred: { resolve: ((result: DocumentPageParseResult) => void) | null } = {
      resolve: null,
    }
    const pending = new Promise<DocumentPageParseResult>((resolve) => {
      deferred.resolve = resolve
    })
    const parseDocumentPage = vi.fn(() => pending)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })

    const first = loadParsedDocumentPage(documentId, 1, { forceOcr: true })
    const second = loadParsedDocumentPage(documentId, 1, { forceOcr: true })
    expect(parseDocumentPage).toHaveBeenCalledOnce()
    deferred.resolve?.({ status: "ready", page })

    await expect(first).resolves.toEqual(page)
    await expect(second).resolves.toEqual(page)
  })

  it("forces OCR through the IPC seam and drops the old page before loading", async () => {
    const nativePage = page
    const ocrPage = parsedDocumentPageSchema.parse({
      ...page,
      parser: "PDF.js+PaddleOCR-VL-1.6",
      blocks: [
        {
          id: "page:1:block:0",
          label: "text",
          content: "OCR source",
          contentFormat: "text",
          translationPolicy: "include",
          order: 0,
          bounds: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    })
    const parseDocumentPage = vi.fn(async (request: { forceOcr?: boolean }) => {
      if (!request.forceOcr) return { status: "ready", page: nativePage } as const
      expect(parsedDocumentPage(documentId, 1)).toBeNull()
      return { status: "ready", page: ocrPage } as const
    })
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })
    await loadParsedDocumentPage(documentId, 1)
    expect(parsedDocumentPage(documentId, 1)).toEqual(nativePage)
    invalidateParsedDocumentPage(documentId, 1)
    const result = await loadParsedDocumentPage(documentId, 1, { forceOcr: true })
    expect(result).toEqual(ocrPage)
  })

  it("replaces a PDF.js page with the structured one a translation waits for, never the reverse", async () => {
    const text = parsedDocumentPageSchema.parse({
      ...page,
      parser: "NativeText-1.0",
      configVersion: "page-native-v1",
    })
    let answerSlowRead: (result: DocumentPageParseResult) => void = () => {}
    const slowRead = new Promise<DocumentPageParseResult>((resolve) => {
      answerSlowRead = resolve
    })
    const parseDocumentPage = vi
      .fn<(request: { readonly awaitStructure?: boolean }) => Promise<DocumentPageParseResult>>()
      .mockResolvedValueOnce({ status: "ready", page: text })
      .mockResolvedValueOnce({ status: "ready", page })
      .mockReturnValueOnce(slowRead)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })

    // A quick read, as the paper chat's context does, keeps the PDF.js text first.
    expect(await loadParsedDocumentPage(documentId, 1)).toEqual(text)
    expect(await loadParsedDocumentPage(documentId, 1, { awaitStructure: true })).toEqual(page)
    expect(parsedDocumentPage(documentId, 1)).toEqual(page)

    // A quick read of page 2 answered only after its structured parse is kept.
    const quick = loadParsedDocumentPage(documentId, 2)
    const structured = parsedDocumentPageSchema.parse({ ...page, pageNumber: 2 })
    parseDocumentPage.mockResolvedValueOnce({ status: "ready", page: structured })
    expect(await loadParsedDocumentPage(documentId, 2, { awaitStructure: true })).toEqual(
      structured,
    )
    answerSlowRead({
      status: "ready",
      page: parsedDocumentPageSchema.parse({ ...text, pageNumber: 2 }),
    })
    expect((await quick)?.parser).toBe("PaddleOCR-VL-1.6")
    expect(parsedDocumentPage(documentId, 2)?.parser).toBe("PaddleOCR-VL-1.6")
  })

  it("keeps PDF.js text once the server says no structured parse can be made", async () => {
    const text = parsedDocumentPageSchema.parse({
      ...page,
      parser: "NativeText-1.0",
      configVersion: "page-native-v1",
    })
    const parseDocumentPage = vi.fn(async () => ({ status: "ready", page: text }) as const)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })

    expect(await loadParsedDocumentPage(documentId, 1, { awaitStructure: true })).toEqual(text)
    expect(await loadParsedDocumentPage(documentId, 1, { awaitStructure: true })).toEqual(text)
    expect(parseDocumentPage).toHaveBeenCalledTimes(1)
  })

  it("does not answer a translation's request with a prepared-only look in flight", async () => {
    const parseDocumentPage = vi.fn(async (request: { readonly preparedOnly?: boolean }) =>
      request.preparedOnly
        ? ({ status: "unavailable", reason: "needs_ocr" } as const)
        : ({ status: "ready", page } as const),
    )
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { parseDocumentPage },
    })

    const [prepared, structured] = await Promise.all([
      loadParsedDocumentPage(documentId, 1, { preparedOnly: true }),
      loadParsedDocumentPage(documentId, 1, { awaitStructure: true }),
    ])

    expect(prepared).toBeNull()
    expect(structured).toEqual(page)
    expect(parseDocumentPage).toHaveBeenCalledTimes(2)
  })
})
