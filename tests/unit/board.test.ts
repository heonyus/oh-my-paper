import { describe, expect, it } from "vitest"
import { createBoardCard, saveTranslationAsNote } from "../../src/renderer/lib/board"
import { documentIdSchema } from "../../src/shared/schemas"

describe("createBoardCard", () => {
  it("places a new card next to the selected page instead of a global fixed column", () => {
    const card = createBoardCard({
      documentId: documentIdSchema.parse("aabbccddeeff0011"),
      kind: "note",
      title: "주석",
      body: "본문",
      placement: { x: 944, y: 412 },
      anchor: {
        page: 1,
        quote: "selected text",
        x: 520,
        y: 430,
        fragments: [{ x: 420, y: 418, width: 100, height: 18 }],
      },
    })

    expect({ x: card.x, y: card.y }).toEqual({ x: 944, y: 412 })
  })

  it("preserves translated content and source geometry when saving it as a note", () => {
    const translation = createBoardCard({
      documentId: documentIdSchema.parse("aabbccddeeff0011"),
      kind: "translation",
      title: "페이지 번역",
      body: "능력을 갖추고 있는",
      placement: { x: 944, y: 412 },
      anchor: {
        page: 1,
        quote: "empowered",
        x: 520,
        y: 430,
        fragments: [{ x: 420, y: 418, width: 100, height: 18 }],
      },
    })

    const note = saveTranslationAsNote(translation)

    expect(note.kind).toBe("note")
    expect(note.title).toBe("번역 주석")
    expect(note.body).toBe(translation.body)
    expect(note.anchor).toEqual(translation.anchor)
  })
})
