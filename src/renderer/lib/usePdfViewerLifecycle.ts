import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import { type RefObject, useEffect, useMemo, useRef, useState } from "react"
import "./pdfWorker"
import { readerMessages } from "../messages/reader"
import type { DocumentRecord } from "../types"
import { clearParsedDocumentPages } from "./documentPageRuntime"
import { useTranslator } from "./locale"
import { PdfAstRuntimeSession } from "./pdfAstRuntimeSession"
import type { ViewerSession } from "./pdfColumnSupport"
import * as Pdf from "./pdfColumnSupport"
import type { PreparedSummary } from "./pdfDocumentFeatures"
import { registerPdfDocument } from "./pdfDocumentRegistry"
import type { PdfOutlineEntry } from "./pdfOutline"
import type { PageOverlayState } from "./pdfOverlayAnalysis"
import { enrichOverlayCitations } from "./pdfOverlayBibliography"
import { pdfCanvasDimensionLimit, pdfCanvasPixelBudget } from "./pdfRenderQuality"
import {
  createPdfRetrievalSession,
  type PdfRetrievalRuntime,
  type PdfRetrievalSession,
} from "./pdfRetrievalRuntime"
import { buildPdfRetrievalIndex } from "./pdfSearch"
import { bindViewerEventBridge } from "./pdfViewerEventBridge"
import { preparePdfView } from "./preparePdfSession"
import type { BibliographyMap } from "./structureDetector"

export type UsePdfViewerLifecycleParams = {
  readonly document: DocumentRecord
  readonly zoom: number
  readonly containerRef: RefObject<HTMLDivElement | null>
  readonly viewerRef: RefObject<HTMLDivElement | null>
  readonly sessionRef: RefObject<ViewerSession | null>
  readonly overlayRefreshRef: RefObject<(() => void) | null>
  readonly onLoaded: (summary: PreparedSummary) => void
  readonly onPageActive: (page: number) => void
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onRegisterPageJump?: ((jump: (page: number) => void) => void) | undefined
  readonly onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined
  readonly onRetrievalReady?: ((retrieval: PdfRetrievalRuntime | null) => void) | undefined
  readonly onScaleCommitted?: ((scale: number) => void) | undefined
}

export function usePdfViewerLifecycle({
  document: requestedDocument,
  zoom,
  containerRef,
  viewerRef,
  sessionRef,
  overlayRefreshRef,
  onLoaded,
  onPageActive,
  onOutlineChange,
  onRegisterPageJump,
  onPageJump,
  onRetrievalReady,
  onScaleCommitted,
}: UsePdfViewerLifecycleParams): {
  readonly pageOverlays: Readonly<Record<number, PageOverlayState>>
  readonly error: string | null
} {
  // PDF resources belong to immutable file identity, not save acknowledgements or metadata edits.
  const [document, setDocument] = useState(requestedDocument)
  if (document.id !== requestedDocument.id || document.hash !== requestedDocument.hash)
    setDocument(requestedDocument)
  const resourceDocument = useMemo(
    () => ({
      id: document.id,
      hash: document.hash,
      title: document.title,
      kind: document.kind,
    }),
    [document.id, document.hash, document.title, document.kind],
  )
  const loadedCallback = useRef(onLoaded)
  useEffect(() => {
    loadedCallback.current = onLoaded
  }, [onLoaded])
  const zoomRef = useRef(zoom)
  const bibliographyRef = useRef<BibliographyMap>({})
  const outlineRef = useRef(new Map<string, PdfOutlineEntry>())
  const pageOverlaysRef = useRef<Readonly<Record<number, PageOverlayState>>>({})
  const pageTextsRef = useRef<string[]>([])
  const [pageOverlays, setPageOverlays] = useState<Readonly<Record<number, PageOverlayState>>>({})
  const t = useTranslator(readerMessages)
  // A failure without a message of its own is worded when shown, in the reader's language.
  const [failure, setFailure] = useState<{ readonly message: string | null } | null>(null)
  const error = failure ? (failure.message ?? t("pdf.openFailed")) : null

  useEffect(() => {
    zoomRef.current = zoom
    pageOverlaysRef.current = pageOverlays
  }, [zoom, pageOverlays])

  const initialPage = Math.min(Math.max(document.lastReadPage ?? 1, 1), document.pageCount)

  useEffect(() => {
    let disposed = false
    let unregisterPdf: (() => void) | null = null
    const astRuntime = new PdfAstRuntimeSession({
      id: resourceDocument.id,
      hash: resourceDocument.hash,
    })
    let retrievalSession: PdfRetrievalSession | null = null
    const container = containerRef.current
    const viewerElement = viewerRef.current
    if (!container || !viewerElement) return

    setFailure(null)
    setPageOverlays({})
    pageTextsRef.current = []
    outlineRef.current.clear()
    viewerElement.replaceChildren()

    const eventBus = new EventBus()
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
    onRegisterPageJump?.(Pdf.pageJumpHandler(viewer, onPageJump))

    const bridge = bindViewerEventBridge({
      viewer,
      eventBus,
      container,
      document: resourceDocument,
      initialPage,
      astRuntime,
      zoomRef,
      outlineRef,
      pageTextsRef,
      setPageOverlays,
      onOutlineChange,
      onPageActive,
      onPageJump,
      onRetrievalReady,
      onScaleCommitted,
      getRetrievalSession: () => retrievalSession,
      setRetrievalSession: (s) => {
        retrievalSession = s
      },
      isDisposed: () => disposed,
      subscribeDocumentAnalysis: (listener) => window.ohmypaper.onDocumentAnalysis(listener),
    })

    const releaseExternalLinks = Pdf.bindPdfExternalLinks(container, window.ohmypaper.openExternal)
    overlayRefreshRef.current = bridge.scheduleOverlayRefresh

    const download = new AbortController()
    void window.ohmypaper
      .readDocument(resourceDocument.id, download.signal)
      .then(async (bytes) => {
        const loadingTask = getDocument({ data: bytes })
        const pdf = await loadingTask.promise
        if (disposed) {
          await loadingTask.destroy()
          return
        }
        linkService.setDocument(pdf)
        viewer.setDocument(pdf)
        sessionRef.current = { viewer, pdf, loadingTask }
        unregisterPdf = registerPdfDocument(resourceDocument.id, pdf)
        const ast = await astRuntime.load()
        if (disposed) {
          await loadingTask.destroy()
          return
        }
        const preparation = (async (): Promise<void> => {
          const { summary, bibliography, outline, pageTexts } = await preparePdfView(
            resourceDocument.id,
            resourceDocument.title,
            resourceDocument.kind,
            pdf,
            ast,
          )
          if (disposed) return
          retrievalSession = createPdfRetrievalSession({
            viewer,
            container,
            index: buildPdfRetrievalIndex(pageTexts),
            onPageJump,
          })
          pageTextsRef.current = [...pageTexts]
          onRetrievalReady?.(retrievalSession.runtime)
          bibliographyRef.current = bibliography
          outlineRef.current.clear()
          for (const entry of outline) outlineRef.current.set(`${entry.page}:${entry.title}`, entry)
          onOutlineChange?.(outline)
          setPageOverlays((current) => enrichOverlayCitations(current, bibliography))
          loadedCallback.current(summary)
        })()
        sessionRef.current = { viewer, pdf, loadingTask, preparation }
        await preparation
      })
      .catch((reason: unknown) => {
        if (disposed) return
        setFailure({ message: reason instanceof Error ? reason.message : null })
      })

    return () => {
      disposed = true
      download.abort()
      unregisterPdf?.()
      astRuntime.dispose()
      clearParsedDocumentPages(resourceDocument.id)
      const activeSession = sessionRef.current?.viewer === viewer ? sessionRef.current : null
      if (activeSession) sessionRef.current = null
      viewer.cleanup()
      bridge.dispose()
      releaseExternalLinks()
      retrievalSession?.dispose()
      onRetrievalReady?.(null)
      overlayRefreshRef.current = null
      onRegisterPageJump?.(() => {})
      if (activeSession) Pdf.disposeViewerSession(activeSession)
      viewerElement.replaceChildren()
    }
  }, [
    containerRef,
    resourceDocument,
    initialPage,
    onOutlineChange,
    onPageActive,
    onPageJump,
    onRegisterPageJump,
    onRetrievalReady,
    onScaleCommitted,
    overlayRefreshRef,
    sessionRef,
    viewerRef,
  ])

  return { pageOverlays, error }
}
