import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs"
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import { type JSX, useEffect, useRef, useState } from "react"
import { decodeBase64 } from "../lib/base64"
import { analyzePdfDocument, type PreparedSummary } from "../lib/pdfDocumentFeatures"
import { PdfLayoutWorkerPool } from "../lib/pdfLayoutWorkerPool"
import { extractPdfOutline, outlineTitle, type PdfOutlineEntry } from "../lib/pdfOutline"
import type { PageOverlayState } from "../lib/pdfOverlayAnalysis"
import { nextOverlayState, syncViewerWidth } from "../lib/pdfOverlayRefresh"
import { analyzePageOverlayInWorker } from "../lib/pdfOverlayWorkerAnalysis"
import type { BibliographyMap, DetectedStructure } from "../lib/structureDetector"
import type { DocumentRecord } from "../types"
import { PdfOverlayLayer } from "./PdfOverlayLayer"

GlobalWorkerOptions.workerSrc = workerUrl

type PdfColumnProps = {
  readonly document: DocumentRecord
  readonly zoom: number
  readonly onLoaded: (summary: PreparedSummary) => void
  readonly onPageActive: (page: number) => void
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onRegisterPageJump?: ((jump: (page: number) => void) => void) | undefined
  readonly onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined
  readonly onStructureTrigger?: ((structure: DetectedStructure) => void) | undefined
}

const PDF_URL_PATTERN = /https:\/\/[^\s<>"')]+/iu

function urlFromText(value: string): string | null {
  const match = value.match(PDF_URL_PATTERN)?.[0]
  return match ? match.replace(/[.,;:)]+$/u, "") : null
}

export type { PreparedSummary } from "../lib/pdfDocumentFeatures"

type ViewerSession = {
  readonly viewer: PDFViewer
  readonly pdf: PDFDocumentProxy
  readonly loadingTask: PDFDocumentLoadingTask
}

export function PdfColumn({
  document,
  zoom,
  onLoaded,
  onPageActive,
  onOutlineChange,
  onRegisterPageJump,
  onPageJump,
  onStructureTrigger,
}: PdfColumnProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<ViewerSession | null>(null)
  const zoomRef = useRef(zoom)
  const bibliographyRef = useRef<BibliographyMap>({})
  const outlineRef = useRef(new Map<string, PdfOutlineEntry>())
  const pageOverlaysRef = useRef<Readonly<Record<number, PageOverlayState>>>({})
  const overlayRefreshRef = useRef<(() => void) | null>(null)
  const [pageOverlays, setPageOverlays] = useState<Readonly<Record<number, PageOverlayState>>>({})
  const [error, setError] = useState<string | null>(null)

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
    })
    linkService.setViewer(viewer)
    onRegisterPageJump?.((page: number) => {
      viewer.currentPageNumber = page
      viewer.scrollPageIntoView({ pageNumber: page })
      const pageElement = viewer.getPageView(page - 1)?.div
      if (pageElement) onPageJump?.(page, pageElement)
    })
    eventBus.on("pagechanging", ({ pageNumber }: { readonly pageNumber: number }) => {
      onPageActive(pageNumber)
    })
    eventBus.on("pagesinit", () => {
      viewer.currentScale = zoomRef.current
      requestAnimationFrame(() => {
        syncViewerWidth(container, viewer)
        scheduleOverlayRefresh()
      })
      window.setTimeout(refreshOverlays, 320)
      window.setTimeout(refreshOverlays, 1_000)
    })
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
      const target =
        event.target instanceof Element ? event.target.closest(".textLayer span") : null
      const url = target ? urlFromText(target.textContent ?? "") : null
      if (!url) return
      event.preventDefault()
      event.stopPropagation()
      void window.scourgify.openExternal({ url })
    }
    container.addEventListener("click", handlePdfUrlClick)
    overlayRefreshRef.current = scheduleOverlayRefresh
    eventBus.on("scalechanging", scheduleOverlayRefresh)
    eventBus.on("pagerendered", scheduleOverlayRefresh)
    eventBus.on(
      "textlayerrendered",
      ({
        pageNumber,
        source,
      }: {
        readonly pageNumber: number
        readonly source: { readonly div?: HTMLElement }
      }) => {
        const pageDiv = source.div
        if (!(pageDiv instanceof HTMLElement)) return
        void analyzePageOverlayInWorker(
          layoutPool,
          pageNumber,
          pageDiv,
          bibliographyRef.current,
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
      },
    )

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
        setPageOverlays((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, value]) => [
              key,
              {
                ...value,
                structures: value.structures.map((structure) => {
                  if (structure.kind !== "citation" || structure.reference) return structure
                  const citationKey = structure.quote.match(/\[(\d+)/u)?.[1]
                  const reference = citationKey ? bibliography[citationKey] : undefined
                  return reference ? { ...structure, reference } : structure
                }),
              },
            ]),
          ),
        )
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
      layoutPool.dispose()
      container.removeEventListener("click", handlePdfUrlClick)
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
  ])

  useEffect(() => {
    const session = sessionRef.current
    const container = containerRef.current
    if (session && container) {
      session.viewer.currentScale = zoom
      requestAnimationFrame(() => {
        syncViewerWidth(container, session.viewer)
        overlayRefreshRef.current?.()
      })
    }
  }, [zoom])

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
