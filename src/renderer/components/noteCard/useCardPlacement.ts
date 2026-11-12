import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  movedPlacement,
  type NoteCardPlacement,
  noteCardPlacement,
  type ScreenPoint,
} from "./noteCardPlacement"

type Drag = { readonly x: number; readonly y: number; readonly from: NoteCardPlacement }

/**
 * Where the floating note card sits: it opens where the pointer was, kept inside the window, and
 * its header drags it from there.
 */
export function useCardPlacement(open: boolean) {
  const pointer = useRef<ScreenPoint | null>(null)
  const drag = useRef<Drag | null>(null)
  const [placement, setPlacement] = useState<NoteCardPlacement | null>(null)

  useEffect(() => {
    const track = (event: PointerEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener("pointermove", track, { passive: true })
    return () => window.removeEventListener("pointermove", track)
  }, [])

  // Placed before the first paint of an opening card, so it never flashes elsewhere.
  useLayoutEffect(() => {
    setPlacement(open ? noteCardPlacement(false, pointer.current) : null)
  }, [open])

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || !placement) return
    if (event.target instanceof Element && event.target.closest("button")) return
    event.preventDefault()
    drag.current = { x: event.clientX, y: event.clientY, from: placement }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const start = drag.current
    if (!start) return
    setPlacement(movedPlacement(start.from, event.clientX - start.x, event.clientY - start.y, 1))
  }

  function onPointerUp(): void {
    drag.current = null
  }

  return {
    placed: placement !== null,
    style: placement?.kind === "screen" ? { left: placement.left, top: placement.top } : undefined,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
