import { useCallback, useEffect, useRef } from "react"
import type { BoardCard, CardId, DocumentId } from "../types"

/** Frames to wait for the reader's board to be on screen after a paper opens, about two seconds. */
const BOARD_WAIT_FRAMES = 120

type PendingJump = { readonly documentId: DocumentId; readonly cardId: CardId }

/**
 * Goes to a card on any paper: opens the paper first when it is not the one on screen, then
 * jumps once the reader has mounted its board. The jump is dropped if the reader never shows
 * the paper, so a request made and abandoned does not fire later.
 */
export function useCrossDocumentCardJump(input: {
  readonly activeDocumentId: DocumentId | null
  readonly readerVisible: boolean
  readonly cards: readonly BoardCard[]
  readonly openDocument: (id: DocumentId) => void
  readonly jumpToCard: (id: CardId) => void
}): (documentId: DocumentId, cardId: CardId) => void {
  const pending = useRef<PendingJump | null>(null)
  const frame = useRef(0)
  const { activeDocumentId, readerVisible, cards, openDocument, jumpToCard } = input

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useEffect(() => {
    const next = pending.current
    if (!next || next.documentId !== activeDocumentId || !readerVisible) return
    if (!cards.some((card) => card.id === next.cardId)) return
    pending.current = null
    let remaining = BOARD_WAIT_FRAMES
    const attempt = (): void => {
      if (document.querySelector(".board-viewport")) {
        jumpToCard(next.cardId)
        return
      }
      remaining -= 1
      if (remaining > 0) frame.current = requestAnimationFrame(attempt)
    }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(attempt)
  }, [activeDocumentId, readerVisible, cards, jumpToCard])

  return useCallback(
    (documentId: DocumentId, cardId: CardId): void => {
      pending.current = { documentId, cardId }
      if (documentId !== activeDocumentId || !readerVisible) openDocument(documentId)
      else {
        pending.current = null
        jumpToCard(cardId)
      }
    },
    [activeDocumentId, readerVisible, openDocument, jumpToCard],
  )
}
