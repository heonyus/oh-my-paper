import { describe, expect, it } from "vitest"
import type { BoardTextSelection } from "../../src/renderer/lib/boardSelection"
import { addSelectionContext } from "../../src/renderer/lib/selectionContext"

const selection: BoardTextSelection = {
  page: 1,
  quote: "selected\nphrase",
  fragments: [{ x: 0, y: 0, width: 100, height: 12 }],
  cardPosition: { x: 120, y: 0 },
  context: { before: "", after: "" },
}

describe("selection context", () => {
  it("includes nearby page text around the selected quote", () => {
    const page = document.createElement("article")
    const layer = document.createElement("div")
    layer.className = "textLayer"
    layer.innerHTML = "<span>Before selected phrase after</span>"
    page.append(layer)

    const contextual = addSelectionContext(selection, page)

    expect(contextual.context.before).toBe("Before ")
    expect(contextual.context.after).toBe(" after")
  })
})
