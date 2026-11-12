import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { announcePageRendered } from "../../src/renderer/lib/pageRenderEvents"
import { nextStagedCard, useStagedCards, visibleSpan } from "../../src/renderer/lib/useStagedCards"
import { type BoardCard, boardCardSchema } from "../../src/shared/schemas"

const viewport = { x: 0, y: 0, zoom: 1 }

function card(index: number, y: number, kind: BoardCard["kind"] = "explanation"): BoardCard {
  return boardCardSchema.parse({
    id: `73fcb8ab-9085-4f88-af36-f4d25cdd23${String(index).padStart(2, "0")}`,
    documentId: "aabbccddeeff0011",
    kind,
    title: `card ${index}`,
    body: "body",
    x: 900,
    y,
    minimized: false,
    anchor: { page: 1, quote: "quote", x: 420, y, fragments: [] },
  })
}

/** Each card is scheduled once the one before it is on the board, so time passes in steps. */
function passTime(steps: number): void {
  for (let step = 0; step < steps; step += 1) act(() => void vi.advanceTimersByTime(1_000))
}

function ids(cards: readonly BoardCard[]): readonly BoardCard["id"][] {
  return cards.map((item) => item.id)
}

describe("staged cards order", () => {
  it("takes the card in view first, then the nearest one outside it", () => {
    const view = { top: 1_000, bottom: 2_000 }
    const above = card(1, 100)
    const inside = card(2, 1_500)
    const below = card(3, 2_200)
    const all = [above, inside, below]

    expect(nextStagedCard(new Set(ids(all)), all, view)).toEqual({ id: inside.id, inView: true })
    expect(nextStagedCard(new Set([above.id, below.id]), all, view)).toEqual({
      id: below.id,
      inView: false,
    })
    expect(nextStagedCard(new Set(), all, view)).toBeNull()
  })

  it("widens what the window shows by half a screen each way, in board units", () => {
    expect(visibleSpan({ x: 0, y: -1_000, zoom: 2 }, 800)).toEqual({ top: 300, bottom: 1_100 })
  })
})

describe("useStagedCards", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("draws no card with the paper, then every card once a page has been drawn", () => {
    const cards = [card(1, 100), card(2, 5_000), card(3, 9_000)]
    const { result } = renderHook(() => useStagedCards(cards, viewport, null))
    expect(result.current).toEqual([])

    act(() => announcePageRendered(1))
    passTime(1)
    // The card beside the page being read arrives ahead of the ones further down the paper.
    expect(ids(result.current)).toEqual([cards[0]?.id])

    passTime(3)
    expect(result.current).toBe(cards)
  })

  it("stops waiting for a paper whose page never draws", () => {
    const cards = [card(1, 100)]
    const { result } = renderHook(() => useStagedCards(cards, viewport, null))

    passTime(3)
    expect(result.current).toBe(cards)
  })

  it("draws the active card and a card made after opening at once", () => {
    const opened = [card(1, 100), card(2, 5_000)]
    const { result, rerender } = renderHook(
      ({ cards, keepId }: { cards: readonly BoardCard[]; keepId: BoardCard["id"] | null }) =>
        useStagedCards(cards, viewport, keepId),
      { initialProps: { cards: opened, keepId: opened[1]?.id ?? null } },
    )
    expect(ids(result.current)).toEqual([opened[1]?.id])

    const made = card(3, 300, "note")
    rerender({ cards: [...opened, made], keepId: null })
    expect(ids(result.current)).toEqual([made.id])
  })

  it("leaves marks drawn on the passage out of the wait", () => {
    const cards = [card(1, 100, "highlight"), card(2, 200, "translation")]
    const { result } = renderHook(() => useStagedCards(cards, viewport, null))
    expect(result.current).toBe(cards)
  })
})
