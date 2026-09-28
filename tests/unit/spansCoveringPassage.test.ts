import { describe, expect, it } from "vitest"
import { spansCoveringPassage } from "../../src/renderer/lib/sourceQuoteFlash"

function spans(...texts: string[]): HTMLElement[] {
  return texts.map((text) => {
    const span = document.createElement("span")
    span.textContent = text
    return span
  })
}

describe("spansCoveringPassage", () => {
  it("covers every text-layer span of a passage across line breaks", () => {
    const layer = spans(
      "Before. ",
      "Participants rated the always-",
      "visible translation as easier.",
      " After.",
    )
    expect(
      spansCoveringPassage(
        layer,
        "Participants rated the always-visible translation as easier.",
      ).map((span) => span.textContent),
    ).toEqual(["Participants rated the always-", "visible translation as easier."])
  })

  it("finds a passage by its opening and end when the middle differs", () => {
    const layer = spans(
      "Gist-first reading raised short-answer accuracy from 41% to 59% (d = 0.71) and free recall",
      " idea units from 6.2 to 8.9.",
    )
    expect(
      spansCoveringPassage(
        layer,
        "Gist-first reading raised short-answer accuracy from 41% to 59% (d=0.71) and free-recall idea units from 6.2 to 8.9.",
      ),
    ).toHaveLength(2)
    expect(spansCoveringPassage(layer, "Nothing like this is on the page at all.")).toEqual([])
  })
})
