import { type RefObject, useEffect, useRef } from "react"
import type { BoardCard } from "../types"
import { tightenedHighlights } from "./highlightTightening"
import { onTextLayerRendered } from "./pageRenderEvents"

/**
 * As each page's text layer is laid out, highlights saved as blocks over their passages are
 * redrawn on the lines their quotes are printed on, and the board keeps the redrawn cards.
 */
export function useHighlightTightening(
  cardsRef: RefObject<readonly BoardCard[]>,
  worldRef: RefObject<HTMLElement | null>,
  commitCards: (cards: readonly BoardCard[]) => void,
): void {
  const commitRef = useRef(commitCards)
  useEffect(() => {
    commitRef.current = commitCards
  }, [commitCards])
  useEffect(() => {
    const frames = new Set<number>()
    const unsubscribe = onTextLayerRendered((pageNumber) => {
      const frame = requestAnimationFrame(() => {
        frames.delete(frame)
        const world = worldRef.current
        const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
        if (!world || !page) return
        const cards = cardsRef.current
        const next = tightenedHighlights(cards, pageNumber, page, world)
        if (next !== cards) commitRef.current(next)
      })
      frames.add(frame)
    })
    return () => {
      unsubscribe()
      for (const frame of frames) cancelAnimationFrame(frame)
    }
  }, [cardsRef, worldRef])
}
