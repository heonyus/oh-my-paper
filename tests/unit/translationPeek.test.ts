import { describe, expect, it } from "vitest"
import { placePeek } from "../../src/renderer/components/TranslationPeek"

const bounds = { left: 8, right: 992, top: 8 }

describe("translation peek placement", () => {
  it("sits centred just above the hovered word, its caret on the word", () => {
    const placement = placePeek({ x: 600, top: 300, bottom: 318 }, bounds, 180, 30)

    expect(placement).toEqual({ left: 510, top: 263, side: "above", caret: 90 })
  })

  it("goes under the line when there is no room above", () => {
    expect(placePeek({ x: 600, top: 20, bottom: 38 }, bounds, 180, 30)).toMatchObject({
      top: 45,
      side: "below",
    })
  })

  it("stays inside the board, moving its caret to keep pointing at the word", () => {
    expect(placePeek({ x: 980, top: 300, bottom: 318 }, bounds, 180, 30)).toMatchObject({
      left: 812,
      caret: 168,
    })
    expect(placePeek({ x: 20, top: 300, bottom: 318 }, bounds, 180, 30)).toMatchObject({
      left: 8,
      caret: 12,
    })
  })
})
