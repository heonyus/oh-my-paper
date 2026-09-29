import type { BoardCard, Workspace } from "../../shared/schemas"
import type { DetectedStructure } from "./structureDetector"

export function structureSourceKey(structure: DetectedStructure): string {
  const quote = structure.quote.replace(/\s+/gu, " ").trim().slice(0, 180)
  return `${structure.page}:${structure.kind}:${structure.title}:${quote}`
}

/** A figure, table, equation or section card whose explanation did not finish. */
export const structureFailureBody =
  "AI 설명을 완료하지 못했습니다. 같은 항목을 다시 누르면 재시도합니다."
export const citationFailureBody =
  "읽기 가치 판독을 완료하지 못했습니다. 인용 버튼을 다시 누르면 재시도합니다."
/** A card made from a selection whose answer never came; a new selection asks again. */
export const interruptedCardBody = "AI 응답을 받기 전에 중단되었습니다. 다시 실행하세요."
/** What earlier versions wrote into a failed card, offering no retry. */
const legacyFailureBodies = new Set([
  "AI 요청을 완료하지 못했습니다. 설정을 확인하고 다시 시도해주세요.",
])

function failedExplanation(card: BoardCard): boolean {
  return card.body === structureFailureBody || legacyFailureBodies.has(card.body)
}

export function shouldRegenerateStructureCard(card: BoardCard, generationActive = false): boolean {
  if (card.kind === "citation")
    return !card.sourceMeta?.assessment && (!card.loading || !generationActive)
  // Still waiting with nothing running: a reload or a cancelled request cut it off.
  return card.loading ? !generationActive : failedExplanation(card)
}

/**
 * Cards still waiting for an answer when the reader was last closed: nothing is generating
 * them any more, so they say so instead of loading forever. A structure card retries when its
 * structure is clicked again.
 */
export function settleInterruptedCards(workspace: Workspace): Workspace {
  if (!workspace.cards.some((card) => card.loading)) return workspace
  return {
    ...workspace,
    cards: workspace.cards.map((card) => {
      if (!card.loading) return card
      const body =
        card.kind === "citation"
          ? citationFailureBody
          : card.sourceKey
            ? structureFailureBody
            : interruptedCardBody
      return { ...card, loading: false, body }
    }),
  }
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
