import type { EventBus, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import type { DocumentRecord } from "../types"
import { loadParsedDocumentPage, parsedDocumentPage } from "./documentPageRuntime"
import { refineParsedStructureBounds } from "./parsedPageStructureBounds"
import { parsedPageStructures } from "./parsedPageStructures"
import { parsedPageBodyText } from "./parsedPageTranslation"
import type { PdfAstRuntimeSession } from "./pdfAstRuntimeSession"
import { adoptParsedVisualBounds } from "./pdfFeatureDom"
import type { PdfLayoutWorkerPool } from "./pdfLayoutWorkerPool"
import { outlineTitle, type PdfOutlineEntry } from "./pdfOutline"
import { mergeOverlayStructures, type PageOverlayState } from "./pdfOverlayAnalysis"
import { nextOverlayState, syncViewerWidth } from "./pdfOverlayRefresh"
import { analyzePageOverlayInWorker } from "./pdfOverlayWorkerAnalysis"
import {
  createPdfRetrievalSession,
  type PdfRetrievalRuntime,
  type PdfRetrievalSession,
} from "./pdfRetrievalRuntime"
import { buildPdfRetrievalIndex } from "./pdfSearch"
import type { BibliographyMap } from "./structureDetector"

export type EventBridgeParams = {
  readonly viewer: PDFViewer
  readonly eventBus: EventBus
  readonly container: HTMLDivElement
  readonly document: Pick<DocumentRecord, "id" | "hash">
  readonly initialPage: number
  readonly astRuntime: PdfAstRuntimeSession
  readonly layoutPool: PdfLayoutWorkerPool
  readonly zoomRef: React.RefObject<number>
  readonly bibliographyRef: React.RefObject<BibliographyMap>
  readonly outlineRef: React.RefObject<Map<string, PdfOutlineEntry>>
  readonly pageOverlaysRef: React.RefObject<Readonly<Record<number, PageOverlayState>>>
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
  const activePageRef = { current: 1 }
  let restoringInitialPage = true

  const applyParsedPage = (parsed: ParsedDocumentPage, pageDiv: HTMLElement): void => {
    if (params.isDisposed() || !pageDiv.isConnected) return
    const pageRect = pageDiv.getBoundingClientRect()
    const structures = refineParsedStructureBounds(
      parsedPageStructures(parsed, pageRect.width, pageRect.height),
      (bounds) => adoptParsedVisualBounds(pageDiv, bounds),
    )
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
    const parsedText = parsedPageBodyText(parsed)
    if (parsedText && params.pageTextsRef.current) {
      const pageTexts = [...params.pageTextsRef.current]
      pageTexts[parsed.pageNumber - 1] = parsedText
      params.pageTextsRef.current = pageTexts
      const existingRetrieval = params.getRetrievalSession()
      if (existingRetrieval) {
        existingRetrieval.dispose()
        const newSession = createPdfRetrievalSession({
          viewer: params.viewer,
          container: params.container,
          index: buildPdfRetrievalIndex(pageTexts),
          onPageJump: params.onPageJump,
        })
        params.setRetrievalSession(newSession)
        params.onRetrievalReady?.(newSession.runtime)
      }
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
    void analyzePageOverlayInWorker(
      params.layoutPool,
      parsed.pageNumber,
      pageDiv,
      params.bibliographyRef.current ?? {},
    ).then((analyzed) => {
      if (params.isDisposed() || !pageDiv.isConnected || !analyzed) return
      params.setPageOverlays((current) => {
        const state = current[parsed.pageNumber]
        if (!state || state.pageDiv !== pageDiv) return current
        const merged = mergeOverlayStructures(state.structures, analyzed.structures)
        if (merged.length === state.structures.length) return current
        return { ...current, [parsed.pageNumber]: { ...state, structures: merged } }
      })
    })
  }

  const loadActivePage = (pageNumber: number, pageDiv: HTMLElement): void => {
    void loadParsedDocumentPage(params.document.id, pageNumber).then((parsed) => {
      if (parsed) applyParsedPage(parsed, pageDiv)
    })
  }

  const handlePageChanging = ({ pageNumber }: { readonly pageNumber: number }): void => {
    activePageRef.current = pageNumber
    if (restoringInitialPage) {
      if (pageNumber === params.initialPage) restoringInitialPage = false
      return
    }
    params.onPageActive(pageNumber)
    const pageDiv = params.container.querySelector<HTMLElement>(
      `.page[data-page-number="${pageNumber}"]`,
    )
    if (pageDiv) loadActivePage(pageNumber, pageDiv)
  }

  const refreshOverlays = (): void => {
    for (const pageDiv of params.container.querySelectorAll<HTMLElement>(".page")) {
      const pageNumberText = pageDiv.getAttribute("data-page-number")
      const pageNumber = Number(pageNumberText)
      if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
      const parsed = parsedDocumentPage(params.document.id, pageNumber)
      if (parsed) {
        applyParsedPage(parsed, pageDiv)
        continue
      }
      void analyzePageOverlayInWorker(
        params.layoutPool,
        pageNumber,
        pageDiv,
        params.bibliographyRef.current ?? {},
      ).then((analyzed) => {
        if (params.isDisposed() || !pageDiv.isConnected) return
        const prev = params.pageOverlaysRef.current?.[pageNumber]
        const nextState = nextOverlayState(prev, pageDiv, analyzed)
        if (nextState) params.setPageOverlays((p) => ({ ...p, [pageNumber]: nextState }))
      })
    }
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
    const analyzeFallback = (): void =>
      void analyzePageOverlayInWorker(
        params.layoutPool,
        pageNumber,
        pageDiv,
        params.bibliographyRef.current ?? {},
      ).then((pageState) => {
        if (params.isDisposed() || !pageState) return
        for (const structure of pageState.structures) {
          if (structure.kind !== "section") continue
          const title = outlineTitle(structure.title)
          if (!title) continue
          params.outlineRef.current?.set(`${structure.page}:${title}`, {
            title,
            page: structure.page,
          })
        }
        const currentOutline = params.outlineRef.current
        if (currentOutline) {
          params.onOutlineChange?.([...currentOutline.values()].sort((a, b) => a.page - b.page))
        }
        params.setPageOverlays((prev) => ({ ...prev, [pageNumber]: pageState }))
      })
    if (pageNumber !== activePageRef.current) {
      analyzeFallback()
      return
    }
    void loadParsedDocumentPage(params.document.id, pageNumber).then((parsed) => {
      if (parsed) {
        applyParsedPage(parsed, pageDiv)
        return
      }
      analyzeFallback()
    })
  }

  params.eventBus.on("pagechanging", handlePageChanging)
  params.eventBus.on("pagesinit", handlePagesInit)
  params.eventBus.on("scalechanging", scheduleOverlayRefresh)
  params.eventBus.on("pagerendered", scheduleOverlayRefresh)
  params.eventBus.on("textlayerrendered", handleTextLayerRendered)

  return {
    scheduleOverlayRefresh,
    dispose: () => {
      params.eventBus.off("pagechanging", handlePageChanging)
      params.eventBus.off("pagesinit", handlePagesInit)
      params.eventBus.off("scalechanging", scheduleOverlayRefresh)
      params.eventBus.off("pagerendered", scheduleOverlayRefresh)
      params.eventBus.off("textlayerrendered", handleTextLayerRendered)
    },
  }
}
