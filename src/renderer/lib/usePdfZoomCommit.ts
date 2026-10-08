import { type RefObject, useEffect, useRef } from "react"
import type { ViewerSession } from "./pdfColumnSupport"
import { syncViewerWidth } from "./pdfOverlayRefresh"
import { keepPageSpacing } from "./pdfPageSpacing"

export function usePdfZoomCommit({
  zoom,
  sessionRef,
  containerRef,
  overlayRefreshRef,
  onScaleCommitted,
}: {
  readonly zoom: number
  readonly sessionRef: RefObject<ViewerSession | null>
  readonly containerRef: RefObject<HTMLDivElement | null>
  readonly overlayRefreshRef: RefObject<(() => void) | null>
  readonly onScaleCommitted?: ((zoom: number) => void) | undefined
}): void {
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    const session = sessionRef.current
    const container = containerRef.current
    if (!session || !container) return
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      requestAnimationFrame(() => {
        session.viewer.currentScale = zoom
        keepPageSpacing(session.viewer, zoom)
        syncViewerWidth(container, session.viewer)
        onScaleCommitted?.(zoom)
        overlayRefreshRef.current?.()
      })
    }, 140)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [containerRef, onScaleCommitted, overlayRefreshRef, sessionRef, zoom])
}
