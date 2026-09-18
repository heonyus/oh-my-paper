import { type RefObject, useCallback } from "react"
import type { Viewport } from "../types"

export function usePageJump(
  viewportStateRef: RefObject<Viewport>,
  viewportElementRef: RefObject<HTMLDivElement | null>,
  onViewportChange: (viewport: Viewport) => void,
): (_page: number, pageElement: HTMLElement) => void {
  return useCallback(
    (_page, pageElement) => {
      const viewportElement = viewportElementRef.current
      if (!viewportElement) return
      const viewportRect = viewportElement.getBoundingClientRect()
      const pageRect = pageElement.getBoundingClientRect()
      const targetTop = viewportRect.top + Math.min(80, viewportRect.height * 0.12)
      const current = viewportStateRef.current
      onViewportChange({ ...current, y: current.y + targetTop - pageRect.top })
    },
    [onViewportChange, viewportElementRef, viewportStateRef],
  )
}
