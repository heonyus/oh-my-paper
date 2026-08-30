import { useCallback, useMemo, useState } from "react"
import type { BoardCard, CardId } from "../types"

export function useCardStreams(cards: readonly BoardCard[]): {
  readonly displayCards: readonly BoardCard[]
  readonly streamingIds: ReadonlySet<string>
  readonly append: (id: CardId, delta: string) => void
  readonly clear: (id: CardId) => void
} {
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const append = useCallback((id: CardId, delta: string): void => {
    setBodies((current) => ({ ...current, [id]: (current[id] ?? "") + delta }))
  }, [])
  const clear = useCallback((id: CardId): void => {
    setBodies((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])
  const displayCards = useMemo(
    () =>
      cards.map((card) => {
        const body = bodies[card.id]
        return body === undefined ? card : { ...card, body, loading: false }
      }),
    [bodies, cards],
  )
  return {
    displayCards,
    streamingIds: new Set(Object.keys(bodies)),
    append,
    clear,
  }
}
