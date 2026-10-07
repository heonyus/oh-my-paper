import type { BoardCard, CardId, SourceFragment } from "../types"
import { drawnOnPassage } from "./board"

export type HighlightFragment = {
  readonly key: string
  readonly fragment: SourceFragment
}

function collectHighlightFragments(
  cards: readonly BoardCard[],
  selection: readonly SourceFragment[],
): readonly HighlightFragment[] {
  return [
    ...cards.flatMap((card) =>
      card.anchor.fragments.map((fragment) => ({
        key: `${card.id}-${fragment.x}-${fragment.y}-${fragment.width}-${fragment.height}`,
        fragment,
      })),
    ),
    ...selection.map((fragment) => ({
      key: `selection-${fragment.x}-${fragment.y}-${fragment.width}-${fragment.height}`,
      fragment,
    })),
  ]
}

export function boardHighlightState(
  cards: readonly BoardCard[],
  activeId: CardId | null,
): {
  readonly activeCards: readonly BoardCard[]
  readonly fragments: readonly HighlightFragment[]
  readonly highlights: readonly BoardCard[]
  readonly translations: readonly BoardCard[]
} {
  const activeCards = cards.filter((card) => card.id === activeId)
  return {
    activeCards,
    fragments: collectHighlightFragments(
      activeCards.filter((card) => !drawnOnPassage(card) && card.kind !== "sticky"),
      [],
    ),
    highlights: cards.filter(
      (card) => card.kind === "highlight" && card.anchor.fragments.length > 0,
    ),
    translations: cards.filter(
      (card) => card.kind === "translation" && card.anchor.fragments.length > 0,
    ),
  }
}

/** The id of the highlight whose drawn fragments contain a screen point, topmost first. */
export function highlightAtPoint(
  root: ParentNode,
  point: { readonly x: number; readonly y: number },
): string | null {
  const marks = [...root.querySelectorAll<HTMLElement>("[data-highlight-id]")].reverse()
  for (const mark of marks) {
    const hit = [...mark.children].some((fragment) => {
      const rect = fragment.getBoundingClientRect()
      return (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      )
    })
    if (hit) return mark.getAttribute("data-highlight-id")
  }
  return null
}

/** The translated passage, and the line of it, under a point on the board; topmost first. */
export function translationAtPoint(
  translations: readonly BoardCard[],
  point: { readonly x: number; readonly y: number },
): { readonly card: BoardCard; readonly line: SourceFragment } | null {
  for (const card of [...translations].reverse()) {
    const line = card.anchor.fragments.find(
      (fragment) =>
        point.x >= fragment.x &&
        point.x <= fragment.x + fragment.width &&
        point.y >= fragment.y &&
        point.y <= fragment.y + fragment.height,
    )
    if (line) return { card, line }
  }
  return null
}
