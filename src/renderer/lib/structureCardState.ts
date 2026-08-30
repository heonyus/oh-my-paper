import type { BoardCard } from "../../shared/schemas"
import type { DetectedStructure } from "./structureDetector"

export function structureSourceKey(structure: DetectedStructure): string {
  const quote = structure.quote.replace(/\s+/gu, " ").trim().slice(0, 180)
  return `${structure.page}:${structure.kind}:${structure.title}:${quote}`
}

export function shouldRegenerateStructureCard(card: BoardCard, generationActive = false): boolean {
  return (
    card.kind === "citation" && !card.sourceMeta?.assessment && (!card.loading || !generationActive)
  )
}

function matchesStructure(
  card: BoardCard,
  sourceKey: string,
  structure: DetectedStructure,
): boolean {
  return (
    card.sourceKey === sourceKey ||
    (card.anchor.page === structure.page &&
      card.title === structure.title &&
      card.anchor.quote === structure.quote)
  )
}

export function upsertStructureCard(
  cards: readonly BoardCard[],
  freshCard: BoardCard,
  structure: DetectedStructure,
): { readonly cards: readonly BoardCard[]; readonly card: BoardCard; readonly reused: boolean } {
  const sourceKey = structureSourceKey(structure)
  const existing = cards.find((item) => matchesStructure(item, sourceKey, structure))
  if (!existing) return { cards: [...cards, freshCard], card: freshCard, reused: false }
  const card = { ...existing, anchor: freshCard.anchor, sourceKey }
  return {
    cards: cards.map((item) => (item.id === existing.id ? card : item)),
    card,
    reused: true,
  }
}
