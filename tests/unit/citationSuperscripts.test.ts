import { describe, expect, it } from "vitest"
import { joinLineText, type LineTextItem } from "../../src/electron/citationSuperscripts"

function item(text: string, size: number, x: number, baseline: number): LineTextItem {
  return { text, transform: [size, 0, 0, size, x, baseline] }
}

describe("joinLineText", () => {
  it("writes a raised number as a bracketed marker glued to the word and punctuation", () => {
    expect(
      joinLineText([
        item("becoming difficult", 10, 50, 700),
        item("1", 6, 140, 704),
        item(". Humans have", 10, 144, 700),
      ]),
    ).toBe("becoming difficult[1]. Humans have")
  })

  it("keeps a run of superscript pieces as one marker", () => {
    expect(
      joinLineText([
        item("mortality", 10, 50, 700),
        item("4,5", 6, 96, 704),
        item("–", 6, 104, 704),
        item("7", 6, 108, 704),
        item(" . Circulatory", 10, 112, 700),
      ]),
    ).toBe("mortality[4,5–7]. Circulatory")
  })

  it("leaves a number in the body font alone", () => {
    expect(joinLineText([item("MIMIC-III", 10, 50, 700), item("21", 10, 100, 700)])).toBe(
      "MIMIC-III 21",
    )
  })

  it("leaves a raised number after a digit as the exponent it is", () => {
    expect(joinLineText([item("about 10", 10, 50, 700), item("3", 6, 92, 704)])).toBe("about 10 3")
  })

  it("leaves a lowered small number alone", () => {
    expect(joinLineText([item("x", 10, 50, 700), item("1", 6, 56, 697)])).toBe("x 1")
  })

  it("leaves a raised minus exponent alone", () => {
    expect(joinLineText([item("mmol l", 10, 50, 700), item("−1", 6, 80, 704)])).toBe("mmol l −1")
  })

  it("marks a citation that opens a wrapped line by the text after it", () => {
    expect(joinLineText([item("22", 6, 50, 704), item(". Patient outcomes", 10, 58, 700)])).toBe(
      "[22]. Patient outcomes",
    )
  })
})

describe("joinLineText separators", () => {
  it("leaves a raised dash alone when no number joins it", () => {
    expect(joinLineText([item("range", 10, 50, 700), item("–", 6, 80, 704)])).toBe("range –")
  })
})
