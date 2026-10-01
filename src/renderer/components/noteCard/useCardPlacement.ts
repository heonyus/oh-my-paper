import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  boardWorld,
  boardZoom,
  movedPlacement,
  type NoteCardPlacement,
  noteCardPlacement,
  type ScreenPoint,
} from "./noteCardPlacement"

type Drag = {
  readonly x: number
  readonly y: number
  readonly from: NoteCardPlacement
  readonly zoom: number
}

/**
 * Where an open card sits: placed where the pointer last was when it opens, pinned to the board
 * on a paper, and moved by dragging its header.
 */
export function useCardPlacement(open: boolean, onPaper: boolean) {
  const pointer = useRef<ScreenPoint | null>(null)
  const drag = useRef<Drag | null>(null)
  const [placement, setPlacement] = useState<NoteCardPlacement | null>(null)
  const [world, setWorld] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const track = (event: PointerEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener("pointermove", track, { passive: true })
    return () => window.removeEventListener("pointermove", track)
  }, [])

  // Placed before the first paint of an opening card, so it never flashes elsewhere.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      setWorld(null)
      return
    }
    const next = noteCardPlacement(onPaper, pointer.current)
    setPlacement(next)
    setWorld(next.kind === "board" ? boardWorld() : null)
  }, [open, onPaper])

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || !placement) return
    if (event.target instanceof Element && event.target.closest("button")) return
    event.preventDefault()
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      from: placement,
      zoom: world ? boardZoom(world) : 1,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const start = drag.current
    if (!start) return
    setPlacement(
      movedPlacement(start.from, event.clientX - start.x, event.clientY - start.y, start.zoom),
    )
  }

  function onPointerUp(): void {
    drag.current = null
  }

  const pinnedTo = placement?.kind === "board" && world?.isConnected ? world : null
  // A board card whose board has gone (the reader left the paper) floats in its usual corner.
  const style =
    placement?.kind === "board"
      ? pinnedTo
        ? { left: placement.x, top: placement.y }
        : undefined
      : placement
        ? { left: placement.left, top: placement.top }
        : undefined

  return {
    placed: placement !== null,
    /** The board point the card sits at, when it is pinned to a board. */
    pin: placement?.kind === "board" && pinnedTo ? { x: placement.x, y: placement.y } : null,
    /** The board to pin the card to, or null when it floats on the screen. */
    world: pinnedTo,
    style,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
