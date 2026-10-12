import { type RefObject, useCallback } from "react"
import { paperOrigin } from "../../shared/uiLayout"
import type { Viewport } from "../types"
import { alignedDevicePixel } from "./pdfRenderQuality"

export function useBoardPanPreview(
  viewportStateRef: RefObject<Viewport>,
  worldRef: RefObject<HTMLDivElement | null>,
  hostRef: RefObject<HTMLDivElement | null>,
): (viewport: Viewport) => void {
  return useCallback(
    (viewport) => {
      viewportStateRef.current = viewport
      const world = worldRef.current
      if (world) {
        world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
      }
      const surface = hostRef.current?.querySelector<HTMLElement>(".pdf-surface")
      if (!surface) return
      const renderedZoom = Number(surface.getAttribute("data-rendered-zoom")) || viewport.zoom
      const ratio = window.devicePixelRatio || 1
      const x = alignedDevicePixel(viewport.x + paperOrigin.x * viewport.zoom, ratio)
      const y = alignedDevicePixel(viewport.y + paperOrigin.y * viewport.zoom, ratio)
      surface.style.transform = `translate(${x}px, ${y}px) scale(${viewport.zoom / renderedZoom})`
    },
    [hostRef, viewportStateRef, worldRef],
  )
}
