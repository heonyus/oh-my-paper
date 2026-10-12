import { type RefObject, useEffect, useRef } from "react"
import type { BoardCard } from "../types"
import { repairedAnchors } from "./anchorRepair"
import { onTextLayerRendered } from "./pageRenderEvents"

/**
 * As each page's text layer is laid out, cards drawn beside their passages or as blocks over
 * them are redrawn on the lines their quotes are printed on, and the board keeps them so.
 * Pages are laid out again whenever they scroll back into view or the zoom changes; a page
 * whose cards were checked already, and have not changed since, is not read again.
 */
export function useAnchorRepair(
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
    const checked = new Map<number, readonly BoardCard[]>()
    const unsubscribe = onTextLayerRendered((pageNumber) => {
      const frame = requestAnimationFrame(() => {
        frames.delete(frame)
        const world = worldRef.current
        const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
        if (!world || !page) return
        const cards = cardsRef.current
        if (checked.get(pageNumber) === cards) return
        const next = repairedAnchors(cards, pageNumber, page, world)
        checked.set(pageNumber, next)
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
