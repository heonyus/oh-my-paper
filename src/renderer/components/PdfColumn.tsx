import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import { type JSX, useEffect, useRef, useState } from "react"
import type { DocumentLayoutPage } from "../../shared/documentLayout"
import { decodeBase64 } from "../lib/base64"
import { urlFromPdfClickTarget, type ViewerSession } from "../lib/pdfColumnSupport"
import { analyzePdfDocument } from "../lib/pdfDocumentFeatures"
import { PdfLayoutWorkerPool } from "../lib/pdfLayoutWorkerPool"
import { extractPdfOutline, outlineTitle, type PdfOutlineEntry } from "../lib/pdfOutline"
import type { PageOverlayState } from "../lib/pdfOverlayAnalysis"
import { enrichOverlayCitations } from "../lib/pdfOverlayBibliography"
import { nextOverlayState, syncViewerWidth } from "../lib/pdfOverlayRefresh"
import { analyzePageOverlayInWorker } from "../lib/pdfOverlayWorkerAnalysis"
import { pdfCanvasDimensionLimit, pdfCanvasPixelBudget } from "../lib/pdfRenderQuality"
import type { BibliographyMap } from "../lib/structureDetector"
import { usePdfZoomCommit } from "../lib/usePdfZoomCommit"
import type { PdfColumnProps } from "./PdfColumnProps"
import { PdfOverlayLayer } from "./PdfOverlayLayer"

GlobalWorkerOptions.workerSrc = workerUrl

export type { PreparedSummary } from "../lib/pdfDocumentFeatures"

export function PdfColumn({
  document,
  zoom,
  onLoaded,
  onPageActive,
  onOutlineChange,
  onRegisterPageJump,
  onPageJump,
  onStructureTrigger,
  onScaleCommitted,
}: PdfColumnProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<ViewerSession | null>(null)
  const zoomRef = useRef(zoom)
  const bibliographyRef = useRef<BibliographyMap>({})
  const outlineRef = useRef(new Map<string, PdfOutlineEntry>())
  const pageOverlaysRef = useRef<Readonly<Record<number, PageOverlayState>>>({})
  const layoutPagesRef = useRef<ReadonlyMap<number, DocumentLayoutPage>>(new Map())
  const overlayRefreshRef = useRef<(() => void) | null>(null)
  const [pageOverlays, setPageOverlays] = useState<Readonly<Record<number, PageOverlayState>>>({})
  const [error, setError] = useState<string | null>(null)
  usePdfZoomCommit({
    zoom,
    sessionRef,
    containerRef,
    overlayRefreshRef,
    onScaleCommitted,
  })

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    pageOverlaysRef.current = pageOverlays
  }, [pageOverlays])

  useEffect(() => {
    let disposed = false
    const container = containerRef.current
    const viewerElement = viewerRef.current
    if (!container || !viewerElement) return
    setError(null)
    setPageOverlays({})
    layoutPagesRef.current = new Map()
    outlineRef.current.clear()
    viewerElement.replaceChildren()
    const eventBus = new EventBus()
    const layoutPool = new PdfLayoutWorkerPool()
    const linkService = new PDFLinkService({ eventBus, ignoreDestinationZoom: true })
    const viewer = new PDFViewer({
      container,
      viewer: viewerElement,
      eventBus,
      linkService,
      removePageBorders: true,
      supportsPinchToZoom: false,
      enableAutoLinking: true,
      maxCanvasPixels: pdfCanvasPixelBudget,
      maxCanvasDim: pdfCanvasDimensionLimit,
      enableDetailCanvas: true,
      enableOptimizedPartialRendering: true,
    })
    linkService.setViewer(viewer)
    onRegisterPageJump?.((page: number) => {
      viewer.currentPageNumber = page
      viewer.scrollPageIntoView({ pageNumber: page })
      const pageElement = viewer.getPageView(page - 1)?.div
      if (pageElement) onPageJump?.(page, pageElement)
    })
    const handlePageChanging = ({ pageNumber }: { readonly pageNumber: number }): void => {
      onPageActive(pageNumber)
    }
    const handlePagesInit = (): void => {
      viewer.currentScale = zoomRef.current
      requestAnimationFrame(() => {
        syncViewerWidth(container, viewer)
        onScaleCommitted?.(zoomRef.current)
        scheduleOverlayRefresh()
      })
      window.setTimeout(refreshOverlays, 320)
      window.setTimeout(refreshOverlays, 1_000)
    }
    eventBus.on("pagechanging", handlePageChanging)
    eventBus.on("pagesinit", handlePagesInit)
    const refreshOverlays = (): void => {
      for (const pageDiv of container.querySelectorAll<HTMLElement>(".page")) {
        const pageNumberText = pageDiv.getAttribute("data-page-number")
        const pageNumber = Number(pageNumberText)
        if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
        void analyzePageOverlayInWorker(
          layoutPool,
          pageNumber,
          pageDiv,
          bibliographyRef.current,
          layoutPagesRef.current.get(pageNumber),
        ).then((analyzed) => {
          if (disposed || !pageDiv.isConnected) return
          const nextState = nextOverlayState(pageOverlaysRef.current[pageNumber], pageDiv, analyzed)
          if (nextState) setPageOverlays((prev) => ({ ...prev, [pageNumber]: nextState }))
        })
      }
    }
    const scheduleOverlayRefresh = (): void => {
      requestAnimationFrame(() => {
        refreshOverlays()
        window.setTimeout(refreshOverlays, 180)
      })
    }
    const handlePdfUrlClick = (event: MouseEvent): void => {
      const url = urlFromPdfClickTarget(event.target)
      if (!url) return
      event.preventDefault()
      event.stopPropagation()
      void window.scourgify.openExternal({ url })
    }
    container.addEventListener("click", handlePdfUrlClick, true)
    overlayRefreshRef.current = scheduleOverlayRefresh
    eventBus.on("scalechanging", scheduleOverlayRefresh)
    eventBus.on("pagerendered", scheduleOverlayRefresh)
    const handleTextLayerRendered = ({
      pageNumber,
      source,
    }: {
      readonly pageNumber: number
      readonly source: { readonly div?: HTMLElement }
    }): void => {
      const pageDiv = source.div
      if (!(pageDiv instanceof HTMLElement)) return
      void analyzePageOverlayInWorker(
        layoutPool,
        pageNumber,
        pageDiv,
        bibliographyRef.current,
        layoutPagesRef.current.get(pageNumber),
      ).then((pageState) => {
        if (disposed || !pageState) return
        for (const structure of pageState.structures) {
          if (structure.kind !== "section") continue
          const title = outlineTitle(structure.title)
          if (!title) continue
          outlineRef.current.set(`${structure.page}:${title}`, {
            title,
            page: structure.page,
          })
        }
        onOutlineChange?.([...outlineRef.current.values()].sort((a, b) => a.page - b.page))
        setPageOverlays((prev) => ({ ...prev, [pageNumber]: pageState }))
      })
    }
    eventBus.on("textlayerrendered", handleTextLayerRendered)

    void window.scourgify.readDocumentLayout(document.id).then((result) => {
      if (disposed || result.status !== "ready") return
      layoutPagesRef.current = new Map(
        result.layout.pages.map((page) => [page.pageNumber, page] as const),
      )
      scheduleOverlayRefresh()
    })

    void window.scourgify
      .readDocument(document.id)
      .then(async (encoded) => {
        const loadingTask = getDocument({ data: decodeBase64(encoded) })
        const pdf = await loadingTask.promise
        if (disposed) {
          await loadingTask.destroy()
          return
        }
        sessionRef.current = { viewer, pdf, loadingTask }
        linkService.setDocument(pdf)
        viewer.setDocument(pdf)
        const { summary, bibliography } = await analyzePdfDocument(pdf, document.title)
        bibliographyRef.current = bibliography
        const outline = await extractPdfOutline(pdf)
        outlineRef.current.clear()
        for (const entry of outline) outlineRef.current.set(`${entry.page}:${entry.title}`, entry)
        onOutlineChange?.(outline)
        setPageOverlays((current) => enrichOverlayCitations(current, bibliography))
        onLoaded(summary)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "PDF를 열 수 없습니다.")
      })

    return () => {
      disposed = true
      const activeSession = sessionRef.current?.viewer === viewer ? sessionRef.current : null
      if (activeSession) sessionRef.current = null
      viewer.cleanup()
      eventBus.off("pagechanging", handlePageChanging)
      eventBus.off("pagesinit", handlePagesInit)
      eventBus.off("scalechanging", scheduleOverlayRefresh)
      eventBus.off("pagerendered", scheduleOverlayRefresh)
      eventBus.off("textlayerrendered", handleTextLayerRendered)
      layoutPool.dispose()
      container.removeEventListener("click", handlePdfUrlClick, true)
      overlayRefreshRef.current = null
      onRegisterPageJump?.(() => {})
      if (activeSession) void activeSession.loadingTask.destroy()
      viewerElement.replaceChildren()
    }
  }, [
    document.id,
    document.title,
    onLoaded,
    onOutlineChange,
    onPageActive,
    onRegisterPageJump,
    onPageJump,
    onScaleCommitted,
  ])

  return (
    <div ref={containerRef} className="pdf-viewer-container">
      <div ref={viewerRef} className="pdfViewer" />
      <PdfOverlayLayer
        container={containerRef.current}
        pages={pageOverlays}
        onTrigger={onStructureTrigger}
      />
      {error ? (
        <div className="reader-message" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
