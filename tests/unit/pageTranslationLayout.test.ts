import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { localPageTranslationBlocks } from "../../src/renderer/lib/pageTranslationLayout"
import { documentLayoutPageSchema } from "../../src/shared/documentLayout"

function textItem(text: string, x: number, baseline: number): TextItem {
  return {
    str: text,
    dir: "ltr",
    transform: [10, 0, 0, 10, x, baseline],
    width: Math.max(6, text.length * 6),
    height: 10,
    fontName: "Helvetica",
    hasEOL: false,
  }
}

describe("PP-DocLayout-informed page translation blocks", () => {
  it("joins PDF text fragments into one title block", () => {
    const ast = buildSourceDocumentAst("a".repeat(64), [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [
          textItem("npj |", 40, 740),
          textItem("digita", 80, 740),
          textItem("l", 120, 740),
          textItem("medicine", 130, 740),
        ],
      },
    ])
    const layout = documentLayoutPageSchema.parse({
      pageNumber: 1,
      width: 600,
      height: 800,
      boxes: [{ label: "doc_title", score: 0.99, x: 35, y: 45, width: 160, height: 24 }],
    })

    const blocks = localPageTranslationBlocks(ast, 1, layout)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      kind: "heading",
      structureKind: "title",
      source: "npj | digita l medicine",
    })
    expect(blocks[0]?.sourceItemIds).toHaveLength(4)
  })

  it("excludes table blocks from page translation stream", () => {
    const ast = buildSourceDocumentAst("b".repeat(64), [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [textItem("Cell A1", 40, 740), textItem("Cell B1", 120, 740)],
      },
    ])
    const layout = documentLayoutPageSchema.parse({
      pageNumber: 1,
      width: 600,
      height: 800,
      boxes: [{ label: "table", score: 0.95, x: 30, y: 45, width: 200, height: 100 }],
    })
    const blocks = localPageTranslationBlocks(ast, 1, layout)
    expect(blocks).toHaveLength(0)
  })

  it("uses MinerU paragraph order and content while excluding visual blocks", () => {
    // Given
    const ast = buildSourceDocumentAst("c".repeat(64), [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [
          textItem("Second paragraph split", 40, 670),
          textItem("across PDF runs.", 40, 650),
          textItem("First paragraph.", 330, 740),
          textItem("Figure pixels", 330, 600),
          textItem("E = mc2", 40, 560),
        ],
      },
    ])
    const layout = documentLayoutPageSchema.parse({
      pageNumber: 1,
      width: 1_000,
      height: 1_000,
      parser: "mineru",
      boxes: [
        {
          label: "text",
          score: 0.99,
          x: 530,
          y: 50,
          width: 390,
          height: 70,
          order: 0,
          content: "First paragraph.",
        },
        {
          label: "text",
          score: 0.99,
          x: 50,
          y: 140,
          width: 420,
          height: 80,
          order: 1,
          content: "Second paragraph reconstructed across PDF runs.",
        },
        {
          label: "image",
          score: 0.98,
          x: 520,
          y: 220,
          width: 400,
          height: 260,
          order: 2,
        },
        {
          label: "equation",
          score: 0.97,
          x: 50,
          y: 280,
          width: 360,
          height: 80,
          order: 3,
          content: "$$E = mc^2$$",
        },
      ],
    })

    // When
    const blocks = localPageTranslationBlocks(ast, 1, layout)

    // Then
    expect(blocks.map((block) => block.source)).toEqual([
      "First paragraph.",
      "Second paragraph reconstructed across PDF runs.",
      "$$E = mc^2$$",
    ])
    expect(blocks.map((block) => block.structureKind)).toEqual(["body", "body", "equation"])
    expect(blocks.every((block) => block.sourceItemIds.length > 0)).toBe(true)
  })
})
