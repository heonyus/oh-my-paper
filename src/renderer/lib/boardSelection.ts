import type { Point, SourceFragment } from "../../shared/schemas"
import { cardPlacementBesidePage } from "./board"
import { rectsToElementSpace } from "./selectionGeometry"

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
}

type BoardSelectionInput = {
  readonly pageElement: HTMLElement
  readonly boardWorldElement: HTMLElement
  readonly range: Range
  readonly quote: string
}

export function captureNativeBoardTextSelection(
  input: BoardSelectionInput,
): BoardTextSelection | null {
  const quote = input.quote.trim()
  if (quote.length < 2 || quote.length > 4_000) return null
  const worldRect = input.boardWorldElement.getBoundingClientRect()
  const pageRect = input.pageElement.getBoundingClientRect()
  const worldSize = {
    width: input.boardWorldElement.offsetWidth,
    height: input.boardWorldElement.offsetHeight,
  }
  const renderedWorld = {
    left: worldRect.left,
    top: worldRect.top,
    width: worldRect.width,
    height: worldRect.height,
  }
  const selectionRects = Array.from(input.range.getClientRects(), (rect) => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  })).filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left < pageRect.right &&
      rect.left + rect.width > pageRect.left &&
      rect.top < pageRect.bottom &&
      rect.top + rect.height > pageRect.top,
  )
  const fragments = rectsToElementSpace(selectionRects, renderedWorld, worldSize)
  const pageWorld = rectsToElementSpace(
    [{ left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height }],
    renderedWorld,
    worldSize,
  )[0]
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
