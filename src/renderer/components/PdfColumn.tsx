import { type JSX, useRef } from "react"
import type { ViewerSession } from "../lib/pdfColumnSupport"
import { usePdfViewerLifecycle } from "../lib/usePdfViewerLifecycle"
import { usePdfZoomCommit } from "../lib/usePdfZoomCommit"
import type { PdfColumnProps } from "./PdfColumnProps"
import { PdfColumnView } from "./PdfColumnView"

export function PdfColumn({
  document,
  zoom,
  onLoaded,
  onPageActive,
  onOutlineChange,
  onRegisterPageJump,
  onPageJump,
  onStructureTrigger,
  onRetrievalReady,
  onFindReady,
  onScaleCommitted,
}: PdfColumnProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<ViewerSession | null>(null)
  const overlayRefreshRef = useRef<(() => void) | null>(null)

  usePdfZoomCommit({
    zoom,
    sessionRef,
    containerRef,
    overlayRefreshRef,
    onScaleCommitted,
  })

  const { pageOverlays, error } = usePdfViewerLifecycle({
    document,
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
    onFindReady,
    onScaleCommitted,
  })

  return (
    <PdfColumnView
      containerRef={containerRef}
      viewerRef={viewerRef}
      pages={pageOverlays}
      error={error}
      onStructureTrigger={onStructureTrigger}
    />
  )
}
