import { useEffect, useRef, useState } from "react"
import type { BoardCard, CardId, Viewport } from "../types"
import { drawnOnPassage } from "./board"
import { afterNextPaint, whenIdle } from "./mainThread"
import { usePaperShown } from "./usePaperShown"

/** The height a card is taken to have, for ordering, until it is drawn and has its own. */
const ASSUMED_CARD_HEIGHT = 320

/** The stretch of the board the reader is looking at, in board-world units. */
export type VisibleSpan = { readonly top: number; readonly bottom: number }

/** How far a card sits from what the reader is looking at; zero when it is in view. */
function distanceFromView(card: BoardCard, view: VisibleSpan): number {
  const top = card.y
  const bottom = card.y + (card.height ?? ASSUMED_CARD_HEIGHT)
  if (bottom >= view.top && top <= view.bottom) return 0
  return bottom < view.top ? view.top - bottom : top - view.bottom
}

/** The card to draw next, the one nearest what the reader sees, and whether it is in view. */
export function nextStagedCard(
  waiting: ReadonlySet<CardId>,
  cards: readonly BoardCard[],
  view: VisibleSpan,
): { readonly id: CardId; readonly inView: boolean } | null {
  const centre = (view.top + view.bottom) / 2
  let nearest: { readonly card: BoardCard; readonly distance: number } | null = null
  for (const card of cards) {
    if (!waiting.has(card.id)) continue
    const distance = distanceFromView(card, view)
    const closer =
      !nearest ||
      distance < nearest.distance ||
      (distance === nearest.distance &&
        Math.abs(card.y - centre) < Math.abs(nearest.card.y - centre))
    if (closer) nearest = { card, distance }
  }
  return nearest ? { id: nearest.card.id, inView: nearest.distance === 0 } : null
}

/**
 * What the window can show of the board, widened by half a screen each way so that cards are
 * there before they scroll in. The window's height stands in for the board's: reading the
 * board's own would lay the page out again after every card drawn.
 */
export function visibleSpan(viewport: Viewport, windowHeight: number): VisibleSpan {
  const margin = windowHeight / 2
  return {
    top: (-viewport.y - margin) / viewport.zoom,
    bottom: (windowHeight - viewport.y + margin) / viewport.zoom,
  }
}

/**
 * The cards to draw now. A paper's cards used to be built in the same step that opened it:
 * every explanation's Markdown and formulas, and a whole editor per memo, before the PDF was
 * even asked for, so a paper with a few dozen cards held the window still for seconds and showed
 * nothing. The paper is drawn first. Its cards follow one at a time, nearest first: a card in
 * view after each frame, the others while the page is idle. `keepId` (the active card) and any
 * card made after the paper opened are drawn at once.
 */
export function useStagedCards(
  cards: readonly BoardCard[],
  viewport: Viewport,
  keepId: CardId | null,
): readonly BoardCard[] {
  const [waiting, setWaiting] = useState<ReadonlySet<CardId>>(
    // Highlights and translations are marks on the passage, cheap and drawn with the page.
    () => new Set(cards.filter((card) => !drawnOnPassage(card)).map((card) => card.id)),
  )
  const paperShown = usePaperShown()
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  useEffect(() => {
    if (!paperShown || waiting.size === 0) return
    const next = nextStagedCard(
      waiting,
      cardsRef.current,
      visibleSpan(viewport, window.innerHeight),
    )
    const draw = (): void =>
      setWaiting((current) => {
        // What is left is no longer on the board (deleted since the paper opened).
        if (!next) return new Set()
        const remaining = new Set(current)
        remaining.delete(next.id)
        return remaining
      })
    return next?.inView ? afterNextPaint(draw) : whenIdle(draw)
  }, [paperShown, waiting, viewport])

  if (waiting.size === 0) return cards
  return cards.filter((card) => card.id === keepId || !waiting.has(card.id))
}
