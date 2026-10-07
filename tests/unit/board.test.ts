import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { afterEach, describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  CARD_GAP,
  CARD_WIDTH,
  clearOfCards,
  connectorPath,
  createBoardCard,
  createSelectionCard,
  createStructureCard,
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

  it("opens a figure card in the gutter left of the page", () => {
    // Given / When
    const card = createStructureCard({
      documentId: documentIdSchema.parse("aabbccddeeff0011"),
      structure: {
        id: "figure-2",
        kind: "figure",
        page: 3,
        title: "Figure 2 해설",
        quote: "Figure 2",
        bounds: { x: 120, y: 180, width: 220, height: 160 },
      },
      pageWorld: { x: 300, y: 64, width: 816, height: 1056 },
      fragment: { x: 420, y: 244, width: 220, height: 160 },
      sourceKey: "3:figure:2",
    })

    // Then
    expect(card.x + CARD_WIDTH).toBeLessThan(300)
    expect(card.y).toBe(226)
  })

  it("draws the connector toward whichever side the card sits on", () => {
    // Given
    const anchor = {
      page: 3,
      quote: "Figure 2",
      x: 640,
      y: 324,
      fragments: [{ x: 420, y: 244, width: 220, height: 160 }],
    }
    const card = (x: number) =>
      createBoardCard({
        documentId: documentIdSchema.parse("aabbccddeeff0011"),
        kind: "infographic",
        title: "Figure 2 해설",
        body: "",
        anchor,
        placement: { x, y: 226 },
      })

    // When / Then
    expect(connectorPath(card(-32))).toBe("M 420 324 C 330 324, 358 254, 268 254")
    expect(connectorPath(card(1148))).toBe("M 640 324 C 730 324, 1058 254, 1148 254")
  })
})

describe("clearOfCards", () => {
  const documentId = documentIdSchema.parse("aabbccddeeff0011")
  function cardAt(kind: "explanation" | "translation", x: number, y: number, height = 300) {
    const card = createBoardCard({
      documentId,
      kind,
      title: "카드",
      body: "",
      placement: { x, y },
      anchor: { page: 1, quote: "q", x: 0, y: 0, fragments: [{ x: 0, y: 0, width: 1, height: 1 }] },
    })
    return { ...card, height }
  }

  it("leaves a card where it opens when nothing is there", () => {
    const card = cardAt("explanation", 100, 500)
    expect(clearOfCards(card, [cardAt("explanation", 100, 900)])).toBe(card)
  })

  it("moves a new card below the card it would land on, with room between them", () => {
    const placed = clearOfCards(cardAt("explanation", 100, 500), [cardAt("explanation", 100, 420)])
    expect(placed).toMatchObject({ x: 100, y: 420 + 300 + CARD_GAP })
  })

  it("goes into the next column out when its own column is full far down", () => {
    const column = [0, 1, 2].map((index) => cardAt("explanation", 100, 400 + index * 316))
    const placed = clearOfCards(cardAt("explanation", 100, 500), column)
    expect(placed).toMatchObject({ x: 100 - CARD_WIDTH - CARD_GAP, y: 500 })
  })

  it("opens in the next column out even when the cards beside the page sit a fraction apart", () => {
    const column = [cardAt("explanation", 100.27, 400), cardAt("explanation", 100, 716)]
    const placed = clearOfCards(cardAt("explanation", 100, 450), column)
    expect(placed).toMatchObject({ x: 100 - CARD_WIDTH - CARD_GAP, y: 450 })
  })

  it("ignores translations, which are drawn on the passage", () => {
    const card = cardAt("explanation", 100, 500)
    expect(clearOfCards(card, [cardAt("translation", 100, 500)])).toBe(card)
  })
})
