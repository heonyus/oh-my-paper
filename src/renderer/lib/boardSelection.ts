import type { Point, SourceFragment } from "../../shared/schemas"
import { cardPlacementBesidePage } from "./board"
import { mergeSelectionFragments, rectsToElementSpace, type ScreenRect } from "./selectionGeometry"

export type BoardTextSelection = {
  readonly page: number
  readonly quote: string
  readonly fragments: readonly SourceFragment[]
  readonly cardPosition: Point
  readonly context: {
    readonly before: string
    readonly after: string
    readonly section?: string | undefined
  }
  /**
   * Set when the passage was selected in its page's translation: `quote` and `fragments`
   * are the source sentences the selection renders, and the toolbar sits by the selection.
   */
  readonly viaTranslation?: {
    readonly text: string
    readonly anchor: SourceFragment
  }
}

type BoardSelectionInput = {
  readonly pageElement: HTMLElement
  readonly boardWorldElement: HTMLElement
  readonly range: Range
  readonly quote: string
}

type BoardRectSelectionInput = {
  readonly pageElement: HTMLElement
  readonly boardWorldElement: HTMLElement
  readonly rects: readonly ScreenRect[]
  readonly quote: string
}

export function screenRect(rect: DOMRect): ScreenRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** Screen rects in board-world units, as the drawn board (zoomed, panned) maps them. */
export function worldFragments(
  boardWorldElement: HTMLElement,
  rects: readonly ScreenRect[],
): readonly SourceFragment[] {
  const worldRect = boardWorldElement.getBoundingClientRect()
  return rectsToElementSpace(
    rects,
    { left: worldRect.left, top: worldRect.top, width: worldRect.width, height: worldRect.height },
    { width: boardWorldElement.offsetWidth, height: boardWorldElement.offsetHeight },
  )
}

/** A selection of `quote` drawn by `rects` on `pageElement`, kept in board-world units. */
export function captureBoardTextSelectionRects(
  input: BoardRectSelectionInput,
): BoardTextSelection | null {
  const quote = input.quote.trim()
  if (quote.length < 2 || quote.length > 4_000) return null
  const pageRect = input.pageElement.getBoundingClientRect()
  const selectionRects = input.rects.filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left < pageRect.right &&
      rect.left + rect.width > pageRect.left &&
      rect.top < pageRect.bottom &&
      rect.top + rect.height > pageRect.top,
  )
  const fragments = mergeSelectionFragments(worldFragments(input.boardWorldElement, selectionRects))
  const pageWorld = worldFragments(input.boardWorldElement, [
    { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
  ])[0]
  const firstFragment = fragments[0]
  if (!firstFragment || !pageWorld) return null
  return {
    page: Number(input.pageElement.getAttribute("data-page-number") ?? "1"),
    quote,
    fragments,
    cardPosition: cardPlacementBesidePage(pageWorld, firstFragment),
    context: { before: "", after: "" },
  }
}

export function captureNativeBoardTextSelection(
  input: BoardSelectionInput,
): BoardTextSelection | null {
  return captureBoardTextSelectionRects({
    pageElement: input.pageElement,
    boardWorldElement: input.boardWorldElement,
    quote: input.quote,
    rects: Array.from(input.range.getClientRects(), screenRect),
  })
}
