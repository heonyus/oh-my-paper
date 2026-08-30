import type { AiRequestRunner, BoardCard } from "../types"

export async function askBoardCard(
  card: BoardCard,
  question: string,
  history: BoardCard["chat"],
  onAiRequest: AiRequestRunner,
  onDelta?: Parameters<AiRequestRunner>[1],
): Promise<string> {
  return onAiRequest(
    {
      action: "chat",
      page: card.anchor.page,
      quote: question,
      sectionContext: `CARD: ${card.title}\n${card.body}\nSOURCE: ${card.anchor.quote}`,
      before: "",
      after: "",
      history: [...history],
    },
    onDelta,
  )
}

export async function regenerateBoardCardTitle(
  card: BoardCard,
  onAiRequest: AiRequestRunner,
): Promise<string> {
  return onAiRequest({
    action: "card_title",
    page: card.anchor.page,
    quote: card.body,
    sectionContext: card.anchor.quote,
    before: "",
    after: "",
  })
}
