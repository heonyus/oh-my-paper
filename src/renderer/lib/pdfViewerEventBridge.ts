import type { EventBus, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import type { DocumentAnalysisSnapshot } from "../../shared/documentAnalysis"
import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import type { DocumentRecord } from "../types"
import {
  awaitingStructuredPage,
  loadParsedDocumentPage,
  parsedDocumentPage,
  subscribeParsedDocumentPages,
} from "./documentPageRuntime"
import { announcePageRendered } from "./pageRenderEvents"
import { parsedPageStructures } from "./parsedPageStructures"
import type { PdfAstRuntimeSession } from "./pdfAstRuntimeSession"
import type { PdfOutlineEntry } from "./pdfOutline"
import type { PageOverlayState } from "./pdfOverlayAnalysis"
import { syncViewerWidth } from "./pdfOverlayRefresh"
import type { PdfRetrievalRuntime, PdfRetrievalSession } from "./pdfRetrievalRuntime"

export type EventBridgeParams = {
  readonly viewer: Pick<
    PDFViewer,
    "currentPageNumber" | "currentScale" | "getPageView" | "scrollPageIntoView"
  >
  readonly eventBus: Pick<EventBus, "on" | "off">
  readonly container: HTMLDivElement
  readonly document: Pick<DocumentRecord, "id" | "hash">
  readonly initialPage: number
  readonly astRuntime: Pick<PdfAstRuntimeSession, "bind">
  readonly zoomRef: React.RefObject<number>
  readonly outlineRef: React.RefObject<Map<string, PdfOutlineEntry>>
  readonly pageTextsRef: React.RefObject<string[]>
  readonly setPageOverlays: React.Dispatch<
    React.SetStateAction<Readonly<Record<number, PageOverlayState>>>
  >
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onPageActive: (page: number) => void
  readonly onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined
  readonly onRetrievalReady?: ((retrieval: PdfRetrievalRuntime | null) => void) | undefined
  readonly onScaleCommitted?: ((scale: number) => void) | undefined
  readonly getRetrievalSession: () => PdfRetrievalSession | null
  readonly setRetrievalSession: (session: PdfRetrievalSession | null) => void
  readonly isDisposed: () => boolean
  /** Background analysis progress; pages it finishes get their overlays without a re-render. */
  readonly subscribeDocumentAnalysis?:
    | ((listener: (snapshot: DocumentAnalysisSnapshot) => void) => () => void)
    | undefined
}

type InitialPageViewer = Pick<PDFViewer, "currentPageNumber" | "scrollPageIntoView">

export function restoreInitialReaderPage(
  viewer: InitialPageViewer,
  page: number,
  onPageActive: (page: number) => void,
): void {
  viewer.currentPageNumber = page
  viewer.scrollPageIntoView({ pageNumber: page })
  onPageActive(page)
}

export function bindViewerEventBridge(params: EventBridgeParams): {
  readonly scheduleOverlayRefresh: () => void
  readonly dispose: () => void
} {
  const applyParsedPage = (parsed: ParsedDocumentPage, pageDiv: HTMLElement): void => {
    if (params.isDisposed() || !pageDiv.isConnected) return
    const pageRect = pageDiv.getBoundingClientRect()
    const structures = parsedPageStructures(parsed, pageRect.width, pageRect.height)
    for (const structure of structures) {
      if (structure.kind !== "section") continue
      params.outlineRef.current?.set(`${structure.page}:${structure.title}`, {
        title: structure.title,
        page: structure.page,
      })
    }
    const currentOutline = params.outlineRef.current
    if (currentOutline) {
      params.onOutlineChange?.([...currentOutline.values()].sort((a, b) => a.page - b.page))
    }
    params.setPageOverlays((current) => ({
      ...current,
      [parsed.pageNumber]: {
        structures,
        pageDiv,
        pageWidth: pageRect.width,
        pageHeight: pageRect.height,
      },
    }))
  }

  const refreshOverlays = (): void => {
    for (const pageDiv of params.container.querySelectorAll<HTMLElement>(".page")) {
      const pageNumberText = pageDiv.getAttribute("data-page-number")
      const pageNumber = Number(pageNumberText)
      if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
      const parsed = parsedDocumentPage(params.document.id, pageNumber)
      if (parsed) {
        applyParsedPage(parsed, pageDiv)
      }
    }
  }

  const loadPreparedPage = (pageNumber: number, pageDiv: HTMLElement): void => {
    void loadParsedDocumentPage(params.document.id, pageNumber, { preparedOnly: true }).then(
      (parsed) => {
        if (parsed) applyParsedPage(parsed, pageDiv)
      },
    )
  }

  const scheduleOverlayRefresh = (): void => {
    requestAnimationFrame(() => {
      refreshOverlays()
      window.setTimeout(refreshOverlays, 180)
    })
  }

  const handlePagesInit = (): void => {
    params.viewer.currentScale = params.zoomRef.current ?? 1
    restoreInitialReaderPage(params.viewer, params.initialPage, params.onPageActive)
    const pageElement = params.viewer.getPageView(params.initialPage - 1)?.div
    if (pageElement) params.onPageJump?.(params.initialPage, pageElement)
    requestAnimationFrame(() => {
      syncViewerWidth(params.container, params.viewer)
      params.onScaleCommitted?.(params.zoomRef.current ?? 1)
      scheduleOverlayRefresh()
    })
    window.setTimeout(refreshOverlays, 320)
    window.setTimeout(refreshOverlays, 1_000)
  }

  const handleTextLayerRendered = ({
    pageNumber,
    source,
  }: {
    readonly pageNumber: number
    readonly source: { readonly div?: HTMLElement }
  }): void => {
    const pageDiv = source.div
    if (!(pageDiv instanceof HTMLElement)) return
    params.astRuntime.bind(pageNumber)
    params.getRetrievalSession()?.applyToRenderedPage(pageNumber, pageDiv)
    loadPreparedPage(pageNumber, pageDiv)
  }

  const handlePageRendered = ({ pageNumber }: { readonly pageNumber: number }): void => {
    scheduleOverlayRefresh()
    announcePageRendered(pageNumber)
  }

  params.eventBus.on("pagesinit", handlePagesInit)
  params.eventBus.on("scalechanging", scheduleOverlayRefresh)
  params.eventBus.on("pagerendered", handlePageRendered)
  params.eventBus.on("textlayerrendered", handleTextLayerRendered)

  const unsubscribeParsedPages = subscribeParsedDocumentPages(params.document.id, (parsed) => {
    const pageDiv = params.container.querySelector<HTMLElement>(
      `.page[data-page-number="${parsed.pageNumber}"]`,
    )
    if (pageDiv) applyParsedPage(parsed, pageDiv)
  })

  let analyzedPages = 0
  const unsubscribeAnalysis = params.subscribeDocumentAnalysis?.((snapshot) => {
    const job = snapshot.jobs.find((candidate) => candidate.id === params.document.id)
    if (!job) return
    const completed = job.state === "complete" ? job.pageCount : job.completedPages
    if (completed <= analyzedPages) return
    analyzedPages = completed
    // Pages rendered before their analysis finished have no overlay yet, or one from PDF.js
    // text alone.
    for (const pageDiv of params.container.querySelectorAll<HTMLElement>(".page[data-loaded]")) {
      const pageNumber = Number(pageDiv.getAttribute("data-page-number"))
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > completed) continue
      if (awaitingStructuredPage(params.document.id, pageNumber))
        loadPreparedPage(pageNumber, pageDiv)
    }
  })

  return {
    scheduleOverlayRefresh,
    dispose: () => {
      params.eventBus.off("pagesinit", handlePagesInit)
      params.eventBus.off("scalechanging", scheduleOverlayRefresh)
      params.eventBus.off("pagerendered", handlePageRendered)
      params.eventBus.off("textlayerrendered", handleTextLayerRendered)
      unsubscribeParsedPages()
      unsubscribeAnalysis?.()
    },
  }
}
