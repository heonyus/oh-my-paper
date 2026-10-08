import type { BoardCard, SourceFragment } from "../types"
import { screenRect, worldFragments } from "./boardSelection"
import { mergeSelectionFragments } from "./selectionGeometry"
import { anchoredRangeOfOwners, canonicalText, textOwners } from "./translationTextMatch"

/** A stored highlight at least this much larger than its quote's lines was drawn as a block. */
const blockRatio = 1.5

type Box = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

function union(fragments: readonly SourceFragment[]): Box {
  return {
    left: Math.min(...fragments.map((fragment) => fragment.x)),
    top: Math.min(...fragments.map((fragment) => fragment.y)),
    right: Math.max(...fragments.map((fragment) => fragment.x + fragment.width)),
    bottom: Math.max(...fragments.map((fragment) => fragment.y + fragment.height)),
  }
}

function area(fragments: readonly SourceFragment[]): number {
  return fragments.reduce((sum, fragment) => sum + fragment.width * fragment.height, 0)
}

/** The lines of the page's text layer that print `quote`, in board-world units. */
export function quoteFragments(
  quote: string,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): readonly SourceFragment[] {
  const spans = [...pageElement.querySelectorAll<HTMLElement>(".textLayer span")]
  const range = anchoredRangeOfOwners(textOwners(spans), canonicalText(quote))
  if (!range) return []
  const pageRect = pageElement.getBoundingClientRect()
  const rects = [...range.getClientRects()].filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left < pageRect.right &&
      rect.right > pageRect.left &&
      rect.top < pageRect.bottom &&
      rect.bottom > pageRect.top,
  )
  return mergeSelectionFragments(worldFragments(boardWorldElement, rects.map(screenRect)))
}

/**
 * A highlight saved as a block over its passage — the box an earlier fallback drew for a
 * sentence it could not find letter for letter — redrawn on the lines its quote is printed
 * on, now that the page's text layer can be read. Only tightened, never moved: the lines
 * must lie inside the saved block, and the block must be clearly larger than they are.
 */
export function tightenedHighlight(
  card: BoardCard,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): BoardCard | null {
  if (card.kind !== "highlight" || card.anchor.fragments.length === 0) return null
  const lines = quoteFragments(card.anchor.quote, pageElement, boardWorldElement)
  const first = lines[0]
  if (!first) return null
  const saved = union(card.anchor.fragments)
  const found = union(lines)
  const tolerance = Math.max(first.height, 2)
  const inside =
    found.left >= saved.left - tolerance &&
    found.top >= saved.top - tolerance &&
    found.right <= saved.right + tolerance &&
    found.bottom <= saved.bottom + tolerance
  if (!inside || area(card.anchor.fragments) < area(lines) * blockRatio) return null
  return {
    ...card,
    anchor: {
      ...card.anchor,
      x: first.x + first.width,
      y: first.y + first.height / 2,
      fragments: [...lines],
    },
  }
}

/** The page's highlight cards redrawn where their quotes are printed; `cards` when none change. */
export function tightenedHighlights(
  cards: readonly BoardCard[],
  pageNumber: number,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): readonly BoardCard[] {
  let changed = false
  const next = cards.map((card) => {
    if (card.kind !== "highlight" || card.anchor.page !== pageNumber) return card
    const tightened = tightenedHighlight(card, pageElement, boardWorldElement)
    if (tightened) changed = true
    return tightened ?? card
  })
  return changed ? next : cards
}
