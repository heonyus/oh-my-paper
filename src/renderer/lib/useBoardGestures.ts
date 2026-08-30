import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
} from "react"
import type { Viewport } from "../../shared/schemas"
import type { BoardTool } from "../types"
import { panViewport, wheelPanDelta, zoomViewportAt } from "./viewport"

type UseBoardGesturesProps = {
  readonly viewport: Viewport
  readonly onViewportChange: (viewport: Viewport) => void
  readonly onClearSelection: () => void
  readonly tool: BoardTool
}

export function useBoardGestures({
  viewport,
  onViewportChange,
  onClearSelection,
  tool,
}: UseBoardGesturesProps) {
  const dragOrigin = useRef<{ x: number; y: number; viewport: Viewport } | null>(null)
  const wheelFrame = useRef<number | null>(null)
  const pendingViewport = useRef(viewport)

  useEffect(() => {
    if (wheelFrame.current === null) pendingViewport.current = viewport
  }, [viewport])

  useEffect(
    () => () => {
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current)
    },
    [],
  )

  function queueWheelViewport(next: Viewport): void {
    pendingViewport.current = next
    if (wheelFrame.current !== null) return
    wheelFrame.current = requestAnimationFrame(() => {
      wheelFrame.current = null
      onViewportChange(pendingViewport.current)
    })
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !(event.target instanceof HTMLElement)) return
    if (event.target.closest("button, .board-card, .paper-structure-overlay")) return
    if (tool === "select" && event.target.closest(".page")) return
    event.preventDefault()
    event.currentTarget.style.userSelect = "none"
    window.getSelection()?.removeAllRanges()
    onClearSelection()
    dragOrigin.current = { x: event.clientX, y: event.clientY, viewport }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>): void {
    const origin = dragOrigin.current
    if (!origin) return
    onViewportChange(
      panViewport(origin.viewport, {
        x: event.clientX - origin.x,
        y: event.clientY - origin.y,
      }),
    )
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>): void {
    const wasPanning = dragOrigin.current !== null
    dragOrigin.current = null
    event.currentTarget.style.removeProperty("user-select")
    if (wasPanning) window.getSelection()?.removeAllRanges()
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const rect = event.currentTarget.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY * 0.006)
      queueWheelViewport(
        zoomViewportAt(
          pendingViewport.current,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          pendingViewport.current.zoom * factor,
        ),
      )
    } else {
      queueWheelViewport(
        panViewport(
          pendingViewport.current,
          wheelPanDelta({ x: event.deltaX, y: event.deltaY }, event.shiftKey),
        ),
      )
    }
  }

  return { startPan, movePan, endPan, handleWheel }
}
