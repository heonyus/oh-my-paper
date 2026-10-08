import type { BoardCard, SourceFragment } from "../types"
import { screenRect, worldFragments } from "./boardSelection"
import { mergeSelectionFragments } from "./selectionGeometry"
import {
  anchoredRangeOfOwners,
  canonicalText,
  rangeOfOwners,
  textOwners,
} from "./translationTextMatch"

/** A stored anchor at least this much larger than its quote's lines was drawn as a block. */
const blockRatio = 1.5
/** A quote found within this many board-world units of its saved place is the same passage. */
const driftMax = 160
/** Saved lines this close to where the quote prints are already right. */
const settled = 1.5
/** Quotes with fewer letters than this match too many places to be moved by. */
const quoteMin = 4
/** Cards drawn on a passage, which their quote locates. A sticky note sits where it was left. */
const anchoredKinds = new Set<BoardCard["kind"]>([
  "highlight",
  "translation",
  "explanation",
  "infographic",
  "note",
  "citation",
])

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

function center(box: Box): { readonly x: number; readonly y: number } {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
}

function rangeFragments(
  range: Range,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): readonly SourceFragment[] {
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
 * Every place the page's text layer prints `quote`, each as its lines in board-world units:
 * letter for letter where it is spelled so, else the one place its opening and closing
 * letters anchor.
 */
export function quoteFragments(
  quote: string,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): readonly (readonly SourceFragment[])[] {
  const needle = canonicalText(quote)
  if (needle.length < quoteMin) return []
  const owners = textOwners([...pageElement.querySelectorAll<HTMLElement>(".textLayer span")])
  const places: (readonly SourceFragment[])[] = []
  for (let from = 0; ; ) {
    const range = rangeOfOwners(owners.slice(from), needle)
    if (!range) break
    const lines = rangeFragments(range, pageElement, boardWorldElement)
    if (lines.length > 0) places.push(lines)
    const text = owners
      .slice(from)
      .map((owner) => owner.character)
      .join("")
    from += text.indexOf(needle) + needle.length
  }
  if (places.length > 0) return places
  const anchored = anchoredRangeOfOwners(owners, needle)
  const lines = anchored ? rangeFragments(anchored, pageElement, boardWorldElement) : []
  return lines.length > 0 ? [lines] : []
}

function sameLines(left: readonly SourceFragment[], right: readonly SourceFragment[]): boolean {
  return (
    left.length === right.length &&
    left.every((fragment, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        Math.abs(fragment.x - other.x) <= settled &&
        Math.abs(fragment.y - other.y) <= settled &&
        Math.abs(fragment.width - other.width) <= settled &&
        Math.abs(fragment.height - other.height) <= settled
      )
    })
  )
}

function withLines(card: BoardCard, lines: readonly SourceFragment[]): BoardCard | null {
  const first = lines[0]
  if (!first) return null
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

/**
 * A card drawn beside its passage rather than on it — anchored at a zoom whose page spacing
 * has since been corrected, or saved as the box drawn for a sentence — redrawn on the lines
 * its quote is printed on, now that the page's text layer can be read. Of the places the
 * quote prints, the one nearest the saved anchor is taken, and only within a few lines of
 * it: a quote printed only elsewhere leaves the card where it is.
 */
export function repairedAnchor(
  card: BoardCard,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): BoardCard | null {
  if (!anchoredKinds.has(card.kind) || card.anchor.fragments.length === 0) return null
  const saved = union(card.anchor.fragments)
  const origin = center(saved)
  const nearest = quoteFragments(card.anchor.quote, pageElement, boardWorldElement)
    .map((lines) => {
      const at = center(union(lines))
      return { lines, distance: Math.hypot(at.x - origin.x, at.y - origin.y) }
    })
    .sort((left, right) => left.distance - right.distance)[0]
  if (!nearest || nearest.distance > driftMax) return null
  if (sameLines(card.anchor.fragments, nearest.lines)) return null
  return withLines(card, nearest.lines)
}

/**
 * A highlight saved as a block over its passage — the box an earlier fallback drew for a
 * sentence it could not find letter for letter — redrawn on the lines its quote is printed
 * on. The lines must lie inside the saved block, and the block must be clearly larger.
 */
export function tightenedHighlight(
  card: BoardCard,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): BoardCard | null {
  if (card.kind !== "highlight") return null
  const repaired = repairedAnchor(card, pageElement, boardWorldElement)
  if (!repaired) return null
  const lines = repaired.anchor.fragments
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
  return repaired
}

/** The page's cards redrawn where their quotes are printed; `cards` itself when none change. */
export function repairedAnchors(
  cards: readonly BoardCard[],
  pageNumber: number,
  pageElement: HTMLElement,
  boardWorldElement: HTMLElement,
): readonly BoardCard[] {
  let changed = false
  const next = cards.map((card) => {
    if (card.anchor.page !== pageNumber) return card
    const repaired = repairedAnchor(card, pageElement, boardWorldElement)
    if (repaired) changed = true
    return repaired ?? card
  })
  return changed ? next : cards
}
