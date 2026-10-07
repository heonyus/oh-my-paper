import { useSyncExternalStore } from "react"
import type { BoardCard } from "../types"

/**
 * The highlight cards drawn on the board, for surfaces outside it — a page's translation
 * pane — that echo them on the passages they cover.
 */
let highlights: readonly BoardCard[] = []
const listeners = new Set<() => void>()

export function publishBoardHighlights(cards: readonly BoardCard[]): void {
  if (cards === highlights) return
  highlights = cards
  for (const listener of listeners) listener()
}

export function useBoardHighlights(): readonly BoardCard[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => highlights,
  )
}
