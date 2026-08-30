import type { AiRequest } from "../../shared/ipc"
import type { BoardCard } from "../types"

export async function askBoardCard(
  card: BoardCard,
  question: string,
  history: BoardCard["chat"],
  onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>,
): Promise<string> {
  if (question === "현재 카드 내용의 간결한 제목만 작성해줘.") {
    return onAiRequest({
      action: "card_title",
      page: card.anchor.page,
      quote: card.body,
      before: card.anchor.quote,
      after: "",
    })
  }
  return onAiRequest({
    action: "chat",
    page: card.anchor.page,
    quote: question,
    before: `CARD: ${card.title}\n${card.body}\nSOURCE: ${card.anchor.quote}`,
    after: "",
    history: [...history],
  })
}
