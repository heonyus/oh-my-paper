import { describe, expect, it } from "vitest"
import { deriveDocumentReadingOrder } from "../../src/renderer/lib/documentReadingOrder"
import { type SourceDocumentAst, sourceDocumentAstSchema } from "../../src/shared/documentAst"

const sourceHash = "a".repeat(64)

function sourceFixture(): SourceDocumentAst {
  return sourceDocumentAstSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash,
    extractorVersion: "test",
    pages: [{ id: "page:1", page: 1, width: 600, height: 800 }],
    items: [
      {
        id: "item:1.0",
        pageId: "page:1",
        text: "Left one",
        normalizedStart: 0,
        normalizedEnd: 8,
        bounds: { x: 40, y: 60, width: 180, height: 12 },
      },
      {
        id: "item:1.1",
        pageId: "page:1",
        text: "Left two",
        normalizedStart: 9,
        normalizedEnd: 17,
        bounds: { x: 40, y: 80, width: 180, height: 12 },
      },
      {
        id: "item:1.2",
        pageId: "page:1",
        text: "Right one",
        normalizedStart: 18,
        normalizedEnd: 27,
        bounds: { x: 340, y: 60, width: 180, height: 12 },
      },
      {
        id: "item:1.3",
        pageId: "page:1",
        text: "Right two",
        normalizedStart: 28,
        normalizedEnd: 37,
        bounds: { x: 340, y: 80, width: 180, height: 12 },
      },
    ],
  })
}

describe("document reading order", () => {
  it("orders complete columns without bridging the gutter", () => {
    // Given
    const source = sourceFixture()

    // When
    const result = deriveDocumentReadingOrder(source)

    // Then
    const page = result.pages[0]
    expect(page?.columns).toHaveLength(2)
    expect(page?.orderedSourceItemIds).toEqual(["item:1.0", "item:1.1", "item:1.2", "item:1.3"])
    expect(result.characterMap).toHaveLength(34)
    expect(result.characterMap.every((entry) => entry.sourceItemId.startsWith("item:"))).toBe(true)
  })

  it("keeps overlapping equal-X text separate and marks its order uncertain", () => {
    // Given
    const source = sourceDocumentAstSchema.parse({
      ...sourceFixture(),
      items: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "first",
          normalizedStart: 0,
          normalizedEnd: 5,
          bounds: { x: 80, y: 100, width: 120, height: 14 },
        },
        {
          id: "item:1.1",
          pageId: "page:1",
          text: "second",
          normalizedStart: 6,
          normalizedEnd: 12,
          bounds: { x: 80, y: 106, width: 120, height: 14 },
        },
      ],
    })

    // When
    const result = deriveDocumentReadingOrder(source)

    // Then
    expect(result.pages[0]?.lines).toHaveLength(2)
    expect(result.pages[0]?.relations.some((relation) => relation.kind === "uncertain")).toBe(true)
    expect(result.pages[0]?.relations.some((relation) => relation.confidence < 0.65)).toBe(true)
  })

  it("keeps rotated text in page order and represents a full-width page as one column", () => {
    // Given
    const source = sourceDocumentAstSchema.parse({
      ...sourceFixture(),
      items: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "Rotated left",
          normalizedStart: 0,
          normalizedEnd: 12,
          bounds: { x: 40, y: 60, width: 12, height: 100 },
        },
        {
          id: "item:1.1",
          pageId: "page:1",
          text: "Rotated right",
          normalizedStart: 13,
          normalizedEnd: 26,
          bounds: { x: 340, y: 60, width: 12, height: 100 },
        },
      ],
      rawItems: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "Rotated left",
          rawStart: 0,
          rawEnd: 12,
          normalizedStart: 0,
          normalizedEnd: 12,
          transform: [0, 10, -10, 0, 40, 740],
          width: 100,
          height: 12,
          hasEOL: true,
          lineId: "line:1.0",
          blockId: "block:1.0",
          bounds: { x: 40, y: 60, width: 12, height: 100 },
        },
        {
          id: "item:1.1",
          pageId: "page:1",
          text: "Rotated right",
          rawStart: 13,
          rawEnd: 26,
          normalizedStart: 13,
          normalizedEnd: 26,
          transform: [0, 10, -10, 0, 340, 740],
          width: 100,
          height: 12,
          hasEOL: true,
          lineId: "line:1.1",
          blockId: "block:1.1",
          bounds: { x: 340, y: 60, width: 12, height: 100 },
        },
      ],
    })

    // When
    const result = deriveDocumentReadingOrder(source)

    // Then
    expect(result.pages[0]?.columns).toHaveLength(2)
    expect(result.pages[0]?.orderedSourceItemIds).toEqual(["item:1.0", "item:1.1"])
    expect(result.pages[0]?.lines.every((line) => line.orientation === "vertical")).toBe(true)

    const singleColumn = sourceDocumentAstSchema.parse({
      ...source,
      items: [
        {
          id: "item:1.0",
          pageId: "page:1",
          text: "One wide line",
          normalizedStart: 0,
          normalizedEnd: 13,
          bounds: { x: 40, y: 60, width: 520, height: 14 },
        },
      ],
      rawItems: [],
    })
    expect(deriveDocumentReadingOrder(singleColumn).pages[0]?.columns).toHaveLength(1)
  })
})
