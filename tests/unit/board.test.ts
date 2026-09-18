import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { afterEach, describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  createBoardCard,
  createPostIt,
  createSelectionCard,
  createStructureCard,
  saveTranslationAsAnnotation,
} from "../../src/renderer/lib/board"
import {
  clearActiveDocumentAst,
  setActiveDocumentAst,
} from "../../src/renderer/lib/documentAstRuntime"
import { documentIdSchema } from "../../src/shared/schemas"

const astDocumentId = documentIdSchema.parse("aabbccddeeff0011")

function textItem(text: string): TextItem {
  return {
    str: text,
    dir: "ltr",
    transform: [10, 0, 0, 10, 40, 740],
    width: text.length * 6,
    height: 10,
    fontName: "Helvetica",
    hasEOL: false,
  }
}

describe("createBoardCard", () => {
  afterEach(() => clearActiveDocumentAst(astDocumentId))
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

  it("preserves translated content and source geometry as a highlight annotation", () => {
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

    const note = saveTranslationAsAnnotation(translation)

    expect(note.kind).toBe("highlight")
    expect(note.title).toBe("번역 주석")
    expect(note.body).toBe(translation.body)
    expect(note.anchor).toEqual(translation.anchor)
  })

  it("creates a persistent post-it at the clicked board coordinate", () => {
    const postIt = createPostIt(documentIdSchema.parse("aabbccddeeff0011"), 4, { x: 780, y: 360 })

    expect(postIt).toMatchObject({
      kind: "sticky",
      title: "포스트잇",
      body: "",
      x: 780,
      y: 360,
      anchor: { page: 4 },
    })
  })

  it("labels a selected quote as a selection translation", () => {
    // Given
    const selection = {
      page: 19,
      quote: "demonstrates",
      fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
      cardPosition: { x: 532, y: 162 },
      context: { before: "", after: "" },
    }

    // When
    const translation = createSelectionCard(
      documentIdSchema.parse("aabbccddeeff0011"),
      selection,
      "translation",
    )

    // Then
    expect(translation?.title).toBe("demonstrates")
  })

  it("uses the original short phrase as its translation card title", () => {
    const translation = createSelectionCard(
      documentIdSchema.parse("aabbccddeeff0011"),
      {
        page: 2,
        quote: "verifiable ground truth",
        fragments: [{ x: 420, y: 180, width: 160, height: 18 }],
        cardPosition: { x: 612, y: 162 },
        context: { before: "", after: "" },
      },
      "translation",
    )

    expect(translation?.title).toBe("verifiable ground truth")
  })

  it("adds AST provenance to a new selection card when the document AST is active", () => {
    setActiveDocumentAst(
      astDocumentId,
      buildSourceDocumentAst("a".repeat(64), [
        { page: 1, width: 600, height: 800, items: [textItem("Introduction")] },
        { page: 2, width: 600, height: 800, items: [textItem("verifiable ground truth")] },
      ]),
    )

    const translation = createSelectionCard(
      astDocumentId,
      {
        page: 2,
        quote: "verifiable ground truth",
        fragments: [{ x: 420, y: 180, width: 160, height: 18 }],
        cardPosition: { x: 612, y: 162 },
        context: { before: "", after: "" },
      },
      "translation",
    )

    expect(translation?.anchor.astRanges).toEqual([{ sourceItemId: "item:2.0", start: 0, end: 23 }])
  })

  it("uses an empty body while a structure card is loading", () => {
    // Given / When
    const loading = createStructureCard({
      documentId: documentIdSchema.parse("aabbccddeeff0011"),
      structure: {
        id: "section-3-2",
        kind: "section",
        page: 3,
        title: "3.2 Data Construction 해설",
        quote: "3.2 Data Construction",
        bounds: { x: 120, y: 180, width: 220, height: 24 },
      },
      pageWorld: { x: 300, y: 64, width: 816, height: 1056 },
      fragment: { x: 420, y: 244, width: 220, height: 24 },
      sourceKey: "3:section:data-construction",
    })

    // Then
    expect(loading).toMatchObject({ body: "", loading: true })
  })
})
