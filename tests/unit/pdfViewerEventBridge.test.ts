import { afterEach, describe, expect, it, vi } from "vitest"
import * as documentPageRuntime from "../../src/renderer/lib/documentPageRuntime"
import { bindViewerEventBridge } from "../../src/renderer/lib/pdfViewerEventBridge"
import { documentRecordSchema } from "../../src/shared/schemas"

afterEach(() => vi.restoreAllMocks())

describe("PDF viewer event bridge", () => {
  it("does not start document recognition merely because a text layer rendered", () => {
    const parsePage = vi
      .spyOn(documentPageRuntime, "loadParsedDocumentPage")
      .mockResolvedValue(null)
    const listeners = new Map<string, (event: object) => void>()
    const eventBus = {
      on: (eventName: string, listener: (event: object) => void): void => {
        listeners.set(eventName, listener)
      },
      off: (eventName: string): void => {
        listeners.delete(eventName)
      },
    }
    const container = document.createElement("div")
    const pageDiv = document.createElement("div")
    pageDiv.className = "page"
    pageDiv.setAttribute("data-page-number", "2")
    container.append(pageDiv)
    const paper = documentRecordSchema.parse({
      id: "aabbccddeeff0011",
      name: "paper.pdf",
      hash: "a".repeat(64),
      bytes: 1024,
      importedAt: "2026-09-21T00:00:00.000Z",
      pageCount: 3,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      quality: { textCharacters: 100, needsOcr: false, warnings: [] },
    })
    const viewer = {
      currentPageNumber: 2,
      currentScale: 1,
      getPageView: vi.fn(() => undefined),
      scrollPageIntoView: vi.fn(),
    }
    const onPageActive = vi.fn()
    const bridge = bindViewerEventBridge({
      viewer,
      eventBus,
      container,
      document: paper,
      initialPage: 1,
      astRuntime: { bind: vi.fn() },
      zoomRef: { current: 1 },
      outlineRef: { current: new Map() },
      pageTextsRef: { current: [] },
      setPageOverlays: vi.fn(),
      onPageActive,
      getRetrievalSession: () => null,
      setRetrievalSession: vi.fn(),
      isDisposed: () => false,
    })

    listeners.get("textlayerrendered")?.({ pageNumber: 2, source: { div: pageDiv } })
    listeners.get("pagechanging")?.({ pageNumber: 1 })
    listeners.get("pagechanging")?.({ pageNumber: 2 })

    expect(parsePage).toHaveBeenCalledWith("aabbccddeeff0011", 2, { preparedOnly: true })
    expect(onPageActive).not.toHaveBeenCalled()
    bridge.dispose()
  })
})
