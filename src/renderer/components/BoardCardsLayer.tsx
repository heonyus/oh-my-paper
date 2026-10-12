import { type JSX, useMemo, useRef } from "react"
import { drawnOnPassage } from "../lib/board"
import { conciseCardTitle } from "../lib/cardPresentation"
import type { AiDeltaHandler, BoardCard, CardId } from "../types"
import { BoardCard as BoardCardView } from "./BoardCard"

type AskHandler = (
  card: BoardCard,
  question: string,
  history: BoardCard["chat"],
  onDelta?: AiDeltaHandler,
) => Promise<string>

type LayerCallbacks = {
  readonly activeId: CardId | null
  readonly onActiveChange: (id: CardId | null) => void
  readonly getCards: () => readonly BoardCard[]
  readonly commitCards: (cards: readonly BoardCard[]) => void
  readonly previewCards: (cards: readonly BoardCard[]) => void
  readonly onJump: (page: number) => void
  readonly onAsk: AskHandler
  readonly onRegenerateTitle: (card: BoardCard) => Promise<string>
}

export function BoardCardsLayer({
  cards,
  activeId,
  autoEditId,
  zoom,
  onActiveChange,
  getCards,
  commitCards,
  previewCards,
  onJump,
  onAsk,
  onRegenerateTitle,
  streamingCardIds = new Set<string>(),
}: {
  readonly cards: readonly BoardCard[]
  readonly activeId: CardId | null
  readonly autoEditId: CardId | null
  readonly zoom: number
  readonly onActiveChange: (id: CardId | null) => void
  readonly getCards: () => readonly BoardCard[]
  readonly commitCards: (cards: readonly BoardCard[]) => void
  readonly previewCards: (cards: readonly BoardCard[]) => void
  readonly onJump: (page: number) => void
  readonly onAsk: AskHandler
  readonly onRegenerateTitle: (card: BoardCard) => Promise<string>
  readonly streamingCardIds?: ReadonlySet<string> | undefined
}): JSX.Element {
  // The board redraws on every pan and zoom commit; a card is only drawn again when its own
  // props change, so the handlers it gets are made once and read the latest callbacks through
  // this ref instead of being recreated per render.
  const latest = useRef<LayerCallbacks>({
    activeId,
    onActiveChange,
    getCards,
    commitCards,
    previewCards,
    onJump,
    onAsk,
    onRegenerateTitle,
  })
  latest.current = {
    activeId,
    onActiveChange,
    getCards,
    commitCards,
    previewCards,
    onJump,
    onAsk,
    onRegenerateTitle,
  }
  const handlers = useMemo(() => {
    const patched = (id: CardId, patch: (card: BoardCard) => BoardCard): readonly BoardCard[] =>
      latest.current.getCards().map((item) => (item.id === id ? patch(item) : item))
    const sized = (width: number, height: number) => (item: BoardCard) => ({
      ...item,
      width: Math.round(width),
      height: Math.round(height),
    })
    return {
      onActiveChange: (id: CardId | null): void => latest.current.onActiveChange(id),
      onJump: (page: number): void => latest.current.onJump(page),
      onAsk: ((card, question, history, onDelta) =>
        latest.current.onAsk(card, question, history, onDelta)) satisfies AskHandler,
      onMove: (id: CardId, x: number, y: number): void =>
        latest.current.previewCards(patched(id, (item) => ({ ...item, x, y }))),
      onMoveEnd: (id: CardId, x: number, y: number): void =>
        latest.current.commitCards(patched(id, (item) => ({ ...item, x, y }))),
      onDelete: (id: CardId): void => {
        const { activeId: active, onActiveChange: setActive, commitCards: commit } = latest.current
        if (active === id) setActive(null)
        commit(latest.current.getCards().filter((item) => item.id !== id))
      },
      onBodyChange: (id: CardId, body: string): void =>
        latest.current.commitCards(patched(id, (item) => ({ ...item, body }))),
      onMinimize: (id: CardId): void =>
        latest.current.commitCards(
          patched(id, (item) => ({ ...item, minimized: !item.minimized })),
        ),
      onResize: (id: CardId, width: number, height: number): void =>
        latest.current.previewCards(patched(id, sized(width, height))),
      onResizeEnd: (id: CardId, width: number, height: number): void =>
        latest.current.commitCards(patched(id, sized(width, height))),
      onChatChange: (id: CardId, chat: BoardCard["chat"]): void =>
        latest.current.commitCards(patched(id, (item) => ({ ...item, chat }))),
      onRegenerateTitle: (id: CardId): void => {
        const target = latest.current.getCards().find((item) => item.id === id)
        if (!target) return
        latest.current.commitCards(patched(id, (item) => ({ ...item, loading: true })))
        void latest.current
          .onRegenerateTitle(target)
          .then((title) =>
            latest.current.commitCards(
              patched(id, (item) => ({
                ...item,
                title: conciseCardTitle(title, item.title),
                loading: false,
              })),
            ),
          )
          .catch(() =>
            latest.current.commitCards(patched(id, (item) => ({ ...item, loading: false }))),
          )
      },
    }
  }, [])
  return (
    <>
      {cards
        .filter((card) => !drawnOnPassage(card))
        .map((card) => (
          <BoardCardView
            key={card.id}
            card={card}
            active={card.id === activeId}
            autoEdit={card.id === autoEditId}
            streaming={streamingCardIds.has(card.id)}
            zoom={zoom}
            {...handlers}
          />
        ))}
    </>
  )
}
