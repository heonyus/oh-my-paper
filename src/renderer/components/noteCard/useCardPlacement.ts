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
 * Where an open card sits. It first follows the pointer, faint, and a click puts it down there
 * (pinned to the board on a paper); after that its header drags it. `Esc` while it follows
 * calls `onCancel`.
 */
export function useCardPlacement(open: boolean, onPaper: boolean, onCancel: () => void) {
  const pointer = useRef<ScreenPoint | null>(null)
  const drag = useRef<Drag | null>(null)
  const [placement, setPlacement] = useState<NoteCardPlacement | null>(null)
  const [following, setFollowing] = useState(false)
  const [world, setWorld] = useState<HTMLElement | null>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel

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
      setFollowing(false)
      return
    }
    const next = noteCardPlacement(onPaper, pointer.current)
    setPlacement(next)
    setWorld(next.kind === "board" ? boardWorld() : null)
    setFollowing(true)
  }, [open, onPaper])

  useEffect(() => {
    if (!following) return
    const move = (event: PointerEvent): void => {
      setPlacement(noteCardPlacement(onPaper, { x: event.clientX, y: event.clientY }, true))
    }
    // Capture, so the click that puts the card down does nothing underneath it.
    let putDown = false
    const put = (event: PointerEvent): void => {
      if (event.button !== 0) return
      putDown = true
      event.preventDefault()
      event.stopPropagation()
      setPlacement(noteCardPlacement(onPaper, { x: event.clientX, y: event.clientY }, true))
      setFollowing(false)
    }
    const swallowClick = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      window.removeEventListener("click", swallowClick, true)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      cancel.current()
    }
    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerdown", put, true)
    window.addEventListener("click", swallowClick, true)
    window.addEventListener("keydown", key, true)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerdown", put, true)
      window.removeEventListener("keydown", key, true)
      // The click that ends the putting-down press is swallowed once and removes itself.
      if (!putDown) window.removeEventListener("click", swallowClick, true)
    }
  }, [following, onPaper])

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || !placement || following) return
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
    /** Put down where it stays; until then it follows the pointer. */
    placed: placement !== null && !following,
    following,
    /** The board point the card sits at, when it is pinned to a board. */
    pin: placement?.kind === "board" && pinnedTo ? { x: placement.x, y: placement.y } : null,
    /** The board to pin the card to, or null when it floats on the screen. */
    world: pinnedTo,
    style,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
