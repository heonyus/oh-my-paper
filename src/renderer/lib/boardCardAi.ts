import type { AiRequest } from "../../shared/ipc"
import type { BoardCard } from "../types"

export async function askBoardCard(
  card: BoardCard,
  question: string,
  history: BoardCard["chat"],
  onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>,
): Promise<string> {
  return onAiRequest({
    action: "chat",
    page: card.anchor.page,
    quote: question,
    before: `CARD: ${card.title}\n${card.body}\nSOURCE: ${card.anchor.quote}`,
    after: "",
    history: [...history],
  })
}

export async function regenerateBoardCardTitle(
  card: BoardCard,
  onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>,
): Promise<string> {
  return onAiRequest({
    action: "card_title",
    page: card.anchor.page,
    quote: card.body,
    before: card.anchor.quote,
    after: "",
  })
}
