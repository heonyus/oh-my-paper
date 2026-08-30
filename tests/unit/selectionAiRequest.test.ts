import { describe, expect, it } from "vitest"
import type { BoardTextSelection } from "../../src/renderer/lib/boardSelection"
import { selectionAiRequest } from "../../src/renderer/lib/selectionAiRequest"

const selection: BoardTextSelection = {
  page: 19,
  quote: "demonstrates",
  fragments: [{ x: 400, y: 240, width: 72, height: 18 }],
  cardPosition: { x: 504, y: 222 },
  context: { before: "A long preceding paragraph", after: "A long following paragraph" },
}

describe("selection AI request", () => {
  it("translates only the selected quote while retaining nearby context", () => {
    // Given / When
    const request = selectionAiRequest("translation", selection)

    // Then
    expect(request).toEqual({
      action: "translation",
      page: 19,
      quote: "demonstrates",
      before: "A long preceding paragraph",
      after: "A long following paragraph",
    })
  })

  it("preserves local context when explaining a selection", () => {
    // Given / When
    const request = selectionAiRequest("explanation", selection)

    // Then
    expect(request).toMatchObject({
      action: "explanation",
      before: selection.context.before,
      after: selection.context.after,
    })
  })

  it("does not create an AI request for local-only selection actions", () => {
    // Given / When
    const request = selectionAiRequest("highlight", selection)

    // Then
    expect(request).toBeNull()
  })
})
