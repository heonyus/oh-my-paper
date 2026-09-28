import type { JSX } from "react"
import type { OwnWordsCheck } from "../../shared/ownWords"
import { saveTranslationAsAnnotation } from "../lib/board"
import { conciseCardTitle } from "../lib/cardPresentation"
import type { AiDeltaHandler, BoardCard, CardId } from "../types"
import { BoardCard as BoardCardView } from "./BoardCard"

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
  onCheckOwnWords,
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
  readonly onAsk: (
    card: BoardCard,
    question: string,
    history: BoardCard["chat"],
    onDelta?: AiDeltaHandler,
  ) => Promise<string>
  readonly onRegenerateTitle: (card: BoardCard) => Promise<string>
  readonly onCheckOwnWords: (card: BoardCard, signal: AbortSignal) => Promise<OwnWordsCheck>
  readonly streamingCardIds?: ReadonlySet<string> | undefined
}): JSX.Element {
  return (
    <>
      {cards
        .filter((card) => card.kind !== "highlight")
        .map((card) => (
          <BoardCardView
            key={card.id}
            card={card}
            active={card.id === activeId}
            autoEdit={card.id === autoEditId}
            streaming={streamingCardIds.has(card.id)}
            zoom={zoom}
            onActiveChange={onActiveChange}
            onMove={(id, x, y) =>
              previewCards(getCards().map((item) => (item.id === id ? { ...item, x, y } : item)))
            }
            onMoveEnd={(id, x, y) =>
              commitCards(getCards().map((item) => (item.id === id ? { ...item, x, y } : item)))
            }
            onDelete={(id) => {
              if (activeId === id) onActiveChange(null)
              commitCards(getCards().filter((item) => item.id !== id))
            }}
            onBodyChange={(id, body) =>
              commitCards(getCards().map((item) => (item.id === id ? { ...item, body } : item)))
            }
            onMinimize={(id) =>
              commitCards(
                getCards().map((item) =>
                  item.id === id ? { ...item, minimized: !item.minimized } : item,
                ),
              )
            }
            onResize={(id, width, height) =>
              previewCards(
                getCards().map((item) =>
                  item.id === id
                    ? { ...item, width: Math.round(width), height: Math.round(height) }
                    : item,
                ),
              )
            }
            onResizeEnd={(id, width, height) =>
              commitCards(
                getCards().map((item) =>
                  item.id === id
                    ? { ...item, width: Math.round(width), height: Math.round(height) }
                    : item,
                ),
              )
            }
            onChatChange={(id, chat) =>
              commitCards(getCards().map((item) => (item.id === id ? { ...item, chat } : item)))
            }
            onAsk={onAsk}
            onCheckOwnWords={onCheckOwnWords}
            onOwnCheckChange={(id, ownCheck) =>
              commitCards(getCards().map((item) => (item.id === id ? { ...item, ownCheck } : item)))
            }
            onRegenerateTitle={(id) => {
              const target = getCards().find((item) => item.id === id)
              if (!target) return
              commitCards(
                getCards().map((item) => (item.id === id ? { ...item, loading: true } : item)),
              )
              void onRegenerateTitle(target)
                .then((title) =>
                  commitCards(
                    getCards().map((item) =>
                      item.id === id
                        ? { ...item, title: conciseCardTitle(title, item.title), loading: false }
                        : item,
                    ),
                  ),
                )
                .catch(() =>
                  commitCards(
                    getCards().map((item) => (item.id === id ? { ...item, loading: false } : item)),
                  ),
                )
            }}
            onSaveAsAnnotation={(id) => {
              if (activeId === id) onActiveChange(null)
              commitCards(
                getCards().map((item) =>
                  item.id === id ? saveTranslationAsAnnotation(item) : item,
                ),
              )
            }}
            onJump={onJump}
          />
        ))}
    </>
  )
}
