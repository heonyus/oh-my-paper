import { afterEach, describe, expect, it, vi } from "vitest"
import * as documentPageRuntime from "../../src/renderer/lib/documentPageRuntime"
import {
  bindViewerEventBridge,
  type EventBridgeParams,
} from "../../src/renderer/lib/pdfViewerEventBridge"
import type { DocumentAnalysisSnapshot } from "../../src/shared/documentAnalysis"
import { documentRecordSchema } from "../../src/shared/schemas"

afterEach(() => vi.restoreAllMocks())

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

function bindTestBridge(overrides: Partial<EventBridgeParams> = {}) {
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
  const onPageActive = vi.fn()
  const bridge = bindViewerEventBridge({
    viewer: {
      currentPageNumber: 2,
      currentScale: 1,
      getPageView: vi.fn(() => undefined),
      scrollPageIntoView: vi.fn(),
    },
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
    ...overrides,
  })
  return { bridge, listeners, pageDiv, onPageActive }
}

describe("PDF viewer event bridge", () => {
  it("does not start document recognition merely because a text layer rendered", () => {
    const parsePage = vi
      .spyOn(documentPageRuntime, "loadParsedDocumentPage")
      .mockResolvedValue(null)
    const { bridge, listeners, pageDiv, onPageActive } = bindTestBridge()

    listeners.get("textlayerrendered")?.({ pageNumber: 2, source: { div: pageDiv } })
    listeners.get("pagechanging")?.({ pageNumber: 1 })
    listeners.get("pagechanging")?.({ pageNumber: 2 })

    expect(parsePage).toHaveBeenCalledWith("aabbccddeeff0011", 2, { preparedOnly: true })
    expect(onPageActive).not.toHaveBeenCalled()
    bridge.dispose()
  })

  it("loads a rendered page's analysis once background analysis reaches it", () => {
    const parsePage = vi
      .spyOn(documentPageRuntime, "loadParsedDocumentPage")
      .mockResolvedValue(null)
    let publish: ((snapshot: DocumentAnalysisSnapshot) => void) | undefined
    const unsubscribe = vi.fn()
    const { bridge, pageDiv } = bindTestBridge({
      subscribeDocumentAnalysis: (listener) => {
        publish = listener
        return unsubscribe
      },
    })
    pageDiv.setAttribute("data-loaded", "true")
    const running = {
      id: paper.id,
      title: paper.title,
      pageCount: paper.pageCount,
      state: "running",
      currentPage: 2,
      stage: "document-analyzing",
      engine: "local",
      attempt: 1,
      maxAttempts: 2,
    } as const

    publish?.([{ ...running, completedPages: 1 }])
    expect(parsePage).not.toHaveBeenCalled()
    publish?.([{ ...running, completedPages: 2 }])
    expect(parsePage).toHaveBeenCalledExactlyOnceWith("aabbccddeeff0011", 2, {
      preparedOnly: true,
    })

    bridge.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
