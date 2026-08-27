import { useCallback } from "react"
import type { AiHistoryMessage, AiRequest } from "../../shared/ipc"
import type { BoardCard, CardId, DocumentRecord, Workspace } from "../types"
import { paperContextForQuestion } from "./pdfSearch"
import { focusWorldRect } from "./viewport"

export function paperQuestionRequest(
  document: DocumentRecord,
  currentPage: number,
  question: string,
  history: readonly AiHistoryMessage[],
): Omit<AiRequest, "documentId"> {
  return {
    action: "chat",
    page: currentPage,
    quote: question,
    before: `Active paper: ${document.title}\n${paperContextForQuestion(question, currentPage)}`,
    after: "",
    history: [...history],
  }
}

export function focusWorkspaceOnCard(
  workspace: Workspace,
  card: BoardCard,
  available: { readonly width: number; readonly height: number },
): Workspace {
  return {
    ...workspace,
    viewport: focusWorldRect(workspace.viewport, available, {
      x: card.x,
      y: card.y,
      width: 320,
      height: 220,
    }),
  }
}

type WorkspaceUpdate = Workspace | null | ((current: Workspace | null) => Workspace | null)

export function useBoardCardJump(
  cards: readonly BoardCard[],
  setWorkspace: (update: WorkspaceUpdate) => void,
  setCurrentPage: (page: number) => void,
): (id: CardId) => void {
  return useCallback(
    (id: CardId): void => {
      const card = cards.find((candidate) => candidate.id === id)
      const board = document.querySelector<HTMLElement>(".board-viewport")
      if (!card || !board) return
      setCurrentPage(card.anchor.page)
      setWorkspace((current) =>
        current
          ? focusWorkspaceOnCard(current, card, {
              width: board.clientWidth,
              height: board.clientHeight,
            })
          : current,
      )
    },
    [cards, setCurrentPage, setWorkspace],
  )
}
