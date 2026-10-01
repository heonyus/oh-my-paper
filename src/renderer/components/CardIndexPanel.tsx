import type { JSX } from "react"
import { useTranslator } from "../lib/locale"
import { boardMessages } from "../messages/board"
import type { BoardCard, CardId } from "../types"
import { type BoardIndexFilter, BoardIndexPanel, cardsInCategory } from "./BoardIndexPanel"

const FILTERS: readonly BoardIndexFilter[] = [
  "all",
  "translation",
  "explanation",
  "infographic",
  "highlight",
  "note",
]

/**
 * Every card on the board in one list, narrowed by type. A type shows up as a filter once the
 * board holds a card of it; a filter whose last card is gone falls back to all.
 */
export function CardIndexPanel({
  cards,
  filter,
  onFilterChange,
  onJump,
}: {
  readonly cards: readonly BoardCard[]
  readonly filter: BoardIndexFilter
  readonly onFilterChange: (filter: BoardIndexFilter) => void
  readonly onJump: (id: CardId) => void
}): JSX.Element {
  const t = useTranslator(boardMessages)
  const available = FILTERS.flatMap((item) => {
    const count = cardsInCategory(cards, item).length
    return item === "all" || count > 0 ? [{ item, count }] : []
  })
  const active = available.some(({ item }) => item === filter) ? filter : "all"
  return (
    <BoardIndexPanel
      cards={cards}
      kind={active}
      label={active === "all" ? t("index.cards") : t(`filter.${active}`)}
      onJump={onJump}
      toolbar={
        available.length > 1 ? (
          <fieldset className="sidebar-segments" aria-label={t("filter.label")}>
            {available.map(({ item, count }) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === active}
                onClick={() => onFilterChange(item)}
              >
                {t(`filter.${item}`)}
                <small>{count}</small>
              </button>
            ))}
          </fieldset>
        ) : null
      }
    />
  )
}
