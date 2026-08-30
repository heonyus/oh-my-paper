import type { BoardCard, CardId, SourceFragment } from "../types"

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
} {
  const activeCards = cards.filter((card) => card.id === activeId)
  const persistent = cards
    .filter((card) => card.kind === "highlight")
    .flatMap((card) => card.anchor.fragments)
  return {
    activeCards,
    fragments: collectHighlightFragments(
      activeCards.filter((card) => card.kind !== "highlight" && card.kind !== "sticky"),
      persistent,
    ),
  }
}
