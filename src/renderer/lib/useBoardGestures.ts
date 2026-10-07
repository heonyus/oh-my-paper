import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react"
import type { Viewport } from "../../shared/schemas"
import type { BoardTool } from "../types"
import { nextWheelAxis, panViewport, zoomViewportAt } from "./viewport"

/**
 * An upright wheel over a page translation's own scrolling text, or a long passage translation
 * shown on hover, scrolls that text while it has room to go that way. Every other wheel over the pane — sideways, zoom, or a translation set on
 * its page copy with nothing to scroll — moves the board the pane sits on.
 */
function scrollsTranslationText(event: WheelEvent): boolean {
  if (!(event.target instanceof Element)) return false
  const body = event.target.closest<HTMLElement>(".page-translation-body, .translation-peek-body")
  if (!body || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return false
  const overflow = getComputedStyle(body).overflowY
  if (overflow !== "auto" && overflow !== "scroll") return false
  return event.deltaY < 0
    ? body.scrollTop > 0
    : body.scrollTop + body.clientHeight < body.scrollHeight - 1
}

type UseBoardGesturesProps = {
  readonly wheelTargetRef: RefObject<HTMLElement | null>
  readonly viewport: Viewport
  readonly onViewportChange: (viewport: Viewport) => void
  readonly onPanPreview?: ((viewport: Viewport) => void) | undefined
  readonly onPanCommit?: (() => void) | undefined
  readonly constrainPan?: ((viewport: Viewport) => Viewport) | undefined
  readonly onClearSelection: () => void
  readonly tool: BoardTool
}

export function useBoardGestures({
  wheelTargetRef,
  viewport,
  onViewportChange,
  onPanPreview,
  onPanCommit,
  constrainPan,
  onClearSelection,
  tool,
}: UseBoardGesturesProps) {
  const dragOrigin = useRef<{ x: number; y: number; viewport: Viewport } | null>(null)
  const panFrame = useRef<number | null>(null)
  const panSettleFrame = useRef<number | null>(null)
  const panMoved = useRef(false)
  const pendingPan = useRef(viewport)
  const wheelFrame = useRef<number | null>(null)
  const wheelPanFrame = useRef<number | null>(null)
  const wheelPanCommitTimer = useRef<number | null>(null)
  const wheelPanActive = useRef(false)
  const wheelAxis = useRef<"x" | "y" | null>(null)
  const wheelAxisTimer = useRef<number | null>(null)
  const nativeWheelTimer = useRef<number | null>(null)
  const pendingViewport = useRef(viewport)
  const wheelHandlerRef = useRef<(event: WheelEvent, target: HTMLElement) => void>(() => undefined)
  const [panning, setPanning] = useState(false)

  wheelHandlerRef.current = handleWheel

  useEffect(() => {
    const target = wheelTargetRef.current
    if (!target) return
    const listener = (event: WheelEvent): void => wheelHandlerRef.current(event, target)
    target.addEventListener("wheel", listener, { passive: false })
    return () => target.removeEventListener("wheel", listener)
  }, [wheelTargetRef])

  useEffect(() => {
    if (!wheelPanActive.current && wheelFrame.current === null && wheelPanFrame.current === null) {
      pendingViewport.current = viewport
    }
  }, [viewport])

  useEffect(
    () => () => {
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current)
      if (wheelPanFrame.current !== null) cancelAnimationFrame(wheelPanFrame.current)
      if (panFrame.current !== null) cancelAnimationFrame(panFrame.current)
      if (panSettleFrame.current !== null) cancelAnimationFrame(panSettleFrame.current)
      if (wheelAxisTimer.current !== null) window.clearTimeout(wheelAxisTimer.current)
      if (wheelPanCommitTimer.current !== null) window.clearTimeout(wheelPanCommitTimer.current)
      if (nativeWheelTimer.current !== null) window.clearTimeout(nativeWheelTimer.current)
    },
    [],
  )

  /** A burst that began scrolling text stays with it, like a browser's own scroll latching. */
  function latchNativeWheel(): void {
    if (nativeWheelTimer.current !== null) window.clearTimeout(nativeWheelTimer.current)
    nativeWheelTimer.current = window.setTimeout(() => {
      nativeWheelTimer.current = null
    }, 160)
  }

  function resetWheelAxisAfterIdle(): void {
    if (wheelAxisTimer.current !== null) window.clearTimeout(wheelAxisTimer.current)
    wheelAxisTimer.current = window.setTimeout(() => {
      wheelAxis.current = null
      wheelAxisTimer.current = null
    }, 160)
  }

  function lockedWheelDelta(delta: { readonly x: number; readonly y: number }): {
    readonly x: number
    readonly y: number
  } {
    wheelAxis.current = nextWheelAxis(wheelAxis.current, delta)
    resetWheelAxisAfterIdle()
    if (wheelAxis.current === "y") return { x: 0, y: -delta.y }
    if (wheelAxis.current === "x") return { x: -delta.x, y: 0 }
    return { x: -delta.x, y: -delta.y }
  }

  function queueViewport(next: Viewport): void {
    pendingViewport.current = next
    if (wheelFrame.current !== null) return
    wheelFrame.current = requestAnimationFrame(() => {
      wheelFrame.current = null
      onViewportChange(pendingViewport.current)
    })
  }

  function finishWheelPan(): void {
    if (!wheelPanActive.current) return
    if (wheelPanFrame.current !== null) {
      cancelAnimationFrame(wheelPanFrame.current)
      wheelPanFrame.current = null
      onPanPreview?.(pendingViewport.current)
    }
    wheelPanActive.current = false
    wheelPanCommitTimer.current = null
    onViewportChange(pendingViewport.current)
    onPanCommit?.()
    if (panSettleFrame.current !== null) cancelAnimationFrame(panSettleFrame.current)
    panSettleFrame.current = requestAnimationFrame(() => {
      panSettleFrame.current = null
      setPanning(false)
    })
  }

  function queueWheelPan(next: Viewport): void {
    pendingViewport.current = constrainPan?.(next) ?? next
    if (!wheelPanActive.current) {
      wheelPanActive.current = true
      setPanning(true)
    }
    if (wheelPanFrame.current === null) {
      wheelPanFrame.current = requestAnimationFrame(() => {
        wheelPanFrame.current = null
        onPanPreview?.(pendingViewport.current)
      })
    }
    if (wheelPanCommitTimer.current !== null) {
      window.clearTimeout(wheelPanCommitTimer.current)
    }
    wheelPanCommitTimer.current = window.setTimeout(finishWheelPan, 160)
  }

  function queuePan(next: Viewport): void {
    pendingPan.current = next
    panMoved.current = true
    if (panFrame.current !== null) return
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = null
      if (onPanPreview) onPanPreview(pendingPan.current)
      else onViewportChange(pendingPan.current)
    })
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !(event.target instanceof HTMLElement)) return
    if (event.target.closest("button, .board-card, .paper-structure-overlay")) return
    if (tool === "select" && event.target.closest(".page")) return
    finishWheelPan()
    if (panSettleFrame.current !== null) {
      cancelAnimationFrame(panSettleFrame.current)
      panSettleFrame.current = null
    }
    event.preventDefault()
    // Preventing the default also keeps focus where it was; pressing the board leaves the note
    // or field outside it, so keys such as N act on the board instead of typing there.
    const focused = document.activeElement
    if (focused instanceof HTMLElement && !event.currentTarget.contains(focused)) focused.blur()
    event.currentTarget.style.userSelect = "none"
    window.getSelection()?.removeAllRanges()
    onClearSelection()
    dragOrigin.current = { x: event.clientX, y: event.clientY, viewport }
    pendingPan.current = viewport
    panMoved.current = false
    setPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>): void {
    const origin = dragOrigin.current
    if (!origin) return
    const next = panViewport(origin.viewport, {
      x: event.clientX - origin.x,
      y: event.clientY - origin.y,
    })
    queuePan(constrainPan?.(next) ?? next)
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>): void {
    const wasPanning = dragOrigin.current !== null
    dragOrigin.current = null
    const framePending = panFrame.current !== null
    if (panFrame.current !== null) {
      cancelAnimationFrame(panFrame.current)
      panFrame.current = null
    }
    if (wasPanning && panMoved.current) {
      if (onPanPreview) {
        onPanPreview(pendingPan.current)
        onViewportChange(pendingPan.current)
        onPanCommit?.()
        panSettleFrame.current = requestAnimationFrame(() => {
          panSettleFrame.current = null
          setPanning(false)
        })
      } else if (framePending) {
        onViewportChange(pendingPan.current)
        onPanCommit?.()
        setPanning(false)
      }
    } else {
      setPanning(false)
    }
    panMoved.current = false
    event.currentTarget.style.removeProperty("user-select")
    if (wasPanning) window.getSelection()?.removeAllRanges()
  }

  function handleWheel(event: WheelEvent, currentTarget: HTMLElement): void {
    // Cards keep the wheel for their own scrolling text; a note left on the board does not.
    if (
      event.target instanceof Element &&
      event.target.closest(".board-card:not([data-kind='sticky'])")
    )
      return
    // A pan already under way keeps moving the board when a translation slides under the cursor.
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      (nativeWheelTimer.current !== null ||
        (!wheelPanActive.current && scrollsTranslationText(event)))
    ) {
      latchNativeWheel()
      return
    }
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      finishWheelPan()
      wheelAxis.current = null
      const rect = currentTarget.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY * 0.006)
      queueViewport(
        zoomViewportAt(
          pendingViewport.current,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          pendingViewport.current.zoom * factor,
        ),
      )
    } else {
      const delta = event.shiftKey
        ? { x: -(event.deltaY || event.deltaX), y: 0 }
        : lockedWheelDelta({ x: event.deltaX, y: event.deltaY })
      const next = panViewport(pendingViewport.current, delta)
      if (onPanPreview) queueWheelPan(next)
      else queueViewport(next)
    }
  }

  return { startPan, movePan, endPan, panning }
}
