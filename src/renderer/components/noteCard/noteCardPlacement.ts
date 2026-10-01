/**
 * Where a note card sits. On a paper it is pinned to the board at a point in board coordinates,
 * so it scrolls and zooms with the pages; elsewhere it floats at a point on the screen.
 */
export type NoteCardPlacement =
  | { readonly kind: "board"; readonly x: number; readonly y: number }
  | { readonly kind: "screen"; readonly left: number; readonly top: number }

export type ScreenPoint = { readonly x: number; readonly y: number }

const CARD_WIDTH = 360
const CARD_HEIGHT = 260
const EDGE = 16

export function boardWorld(): HTMLElement | null {
  return globalThis.document.querySelector<HTMLElement>(".board-world")
}

/** The board's zoom, read from the scale its transform applies. */
export function boardZoom(world: HTMLElement): number {
  const rect = world.getBoundingClientRect()
  return world.offsetWidth > 0 ? rect.width / world.offsetWidth : 1
}

function inside(point: ScreenPoint, rect: DOMRect): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

/**
 * The card opens where the pointer was: on the board when the pointer is over it (or the middle
 * of the board when it is not), on the screen otherwise, kept inside the window.
 */
export function noteCardPlacement(
  onPaper: boolean,
  pointer: ScreenPoint | null,
): NoteCardPlacement {
  const world = onPaper ? boardWorld() : null
  const viewport = world?.parentElement?.getBoundingClientRect()
  if (world && viewport) {
    const point =
      pointer && inside(pointer, viewport)
        ? pointer
        : { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 3 }
    const rect = world.getBoundingClientRect()
    const zoom = boardZoom(world)
    return { kind: "board", x: (point.x - rect.left) / zoom, y: (point.y - rect.top) / zoom }
  }
  const at = pointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 }
  return {
    kind: "screen",
    left: Math.max(EDGE, Math.min(at.x, window.innerWidth - CARD_WIDTH - EDGE)),
    top: Math.max(EDGE, Math.min(at.y, window.innerHeight - CARD_HEIGHT - EDGE)),
  }
}

/** The placement moved by a drag of `dx`, `dy` screen pixels. */
export function movedPlacement(
  placement: NoteCardPlacement,
  dx: number,
  dy: number,
  zoom: number,
): NoteCardPlacement {
  return placement.kind === "board"
    ? { kind: "board", x: placement.x + dx / zoom, y: placement.y + dy / zoom }
    : { kind: "screen", left: placement.left + dx, top: placement.top + dy }
}
