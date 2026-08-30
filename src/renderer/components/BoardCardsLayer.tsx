import type { JSX } from "react"
import { saveTranslationAsNote } from "../lib/board"
import { conciseCardTitle } from "../lib/cardPresentation"
import type { BoardCard, CardId } from "../types"
import { BoardCard as BoardCardView } from "./BoardCard"

export function BoardCardsLayer({
  cards,
  activeId,
  autoEditId,
  zoom,
  onActiveChange,
  getCards,
  commitCards,
  onJump,
  onAsk,
  onRegenerateTitle,
}: {
  readonly cards: readonly BoardCard[]
  readonly activeId: CardId | null
  readonly autoEditId: CardId | null
  readonly zoom: number
  readonly onActiveChange: (id: CardId | null) => void
  readonly getCards: () => readonly BoardCard[]
  readonly commitCards: (cards: readonly BoardCard[]) => void
  readonly onJump: (page: number) => void
  readonly onAsk: (card: BoardCard, question: string, history: BoardCard["chat"]) => Promise<string>
  readonly onRegenerateTitle: (card: BoardCard) => Promise<string>
}): JSX.Element {
  return (
    <>
      {cards.map((card) => (
        <BoardCardView
          key={card.id}
          card={card}
          active={card.id === activeId}
          autoEdit={card.id === autoEditId}
          zoom={zoom}
          onActiveChange={onActiveChange}
          onMove={(id, x, y) =>
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
          onConvertToNote={(id) =>
            commitCards(
              getCards().map((item) => (item.id === id ? saveTranslationAsNote(item) : item)),
            )
          }
          onJump={onJump}
        />
      ))}
    </>
  )
}
