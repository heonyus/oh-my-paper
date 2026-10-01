import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, useState } from "react"

const POSITION_KEY = "ohmypaper:note-card-position"
const EDGE = 8

/** Distance from the window's right and bottom edges, so the card stays put as the window grows. */
export type CardPosition = { readonly right: number; readonly bottom: number }

function storedPosition(): CardPosition | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? "null")
    if (typeof raw !== "object" || raw === null) return null
    const right = Reflect.get(raw, "right")
    const bottom = Reflect.get(raw, "bottom")
    return typeof right === "number" && typeof bottom === "number" ? { right, bottom } : null
  } catch {
    return null
  }
}

function storePosition(position: CardPosition): void {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  } catch {
    // The card then opens in its usual corner next time.
  }
}

function clamp(value: number, maximum: number): number {
  return Math.min(Math.max(value, EDGE), Math.max(EDGE, maximum))
}

type DragStart = {
  readonly x: number
  readonly y: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

/** Dragging the card by its header; the place is remembered in this browser. */
export function useCardPosition(card: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState(storedPosition)
  const drag = useRef<DragStart | null>(null)

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || !card.current) return
    if (event.target instanceof Element && event.target.closest("button")) return
    const rect = card.current.getBoundingClientRect()
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
      width: rect.width,
      height: rect.height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const start = drag.current
    if (!start) return
    setPosition({
      right: clamp(start.right - (event.clientX - start.x), window.innerWidth - start.width - EDGE),
      bottom: clamp(
        start.bottom - (event.clientY - start.y),
        window.innerHeight - start.height - EDGE,
      ),
    })
  }

  function onPointerUp(): void {
    if (!drag.current) return
    drag.current = null
    if (position) storePosition(position)
  }

  return {
    style: position ? { right: position.right, bottom: position.bottom } : undefined,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
