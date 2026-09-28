import { describe, expect, it } from "vitest"
import { pageParagraphs, plainSourceText } from "../../src/renderer/lib/noteSourceParagraphs"
import {
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../../src/shared/documentPageModel"

function page(content: {
  readonly blocks?: unknown[]
  readonly layout?: unknown[]
}): ParsedDocumentPage {
  return parsedDocumentPageSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash: "a".repeat(64),
    parser: "PDF.js+PaddleOCR-VL-1.6",
    configVersion: "test",
    pageNumber: 5,
    width: 600,
    height: 800,
    blocks: content.blocks ?? [],
    ...(content.layout ? { layout: content.layout } : {}),
  })
}

const bounds = (y: number, x = 50) => ({ x, y, width: 400, height: 10 })

describe("page paragraphs", () => {
  it("reduces layout markup to the words on the page", () => {
    expect(
      plainSourceText("- In this work we employ $h = 8$ heads with $d_{k}$ and \\mathbb{R}"),
    ).toBe("In this work we employ h = 8 heads with d k and R")
  })

  it("uses the layout model's paragraphs with the heading above them", () => {
    const paragraphs = pageParagraphs(
      page({
        layout: [
          {
            label: "paragraph_title",
            order: 0,
            bounds: bounds(10),
            content: "### 3.3 Feed-Forward Networks",
          },
          {
            label: "text",
            order: 1,
            bounds: bounds(30),
            content:
              "In addition to attention sub-layers, each layer contains a fully connected network.",
          },
          { label: "page_number", order: 2, bounds: bounds(790), content: "5" },
        ],
      }),
    )
    expect(paragraphs).toEqual([
      {
        id: "page:5:layout:1",
        page: 5,
        text: "In addition to attention sub-layers, each layer contains a fully connected network.",
        heading: "3.3 Feed-Forward Networks",
      },
    ])
  })

  it("joins parser lines back into paragraphs by their spacing", () => {
    const line = (order: number, y: number, content: string, x = 50) => ({
      id: `page:5:block:${order}`,
      label: "text",
      order,
      bounds: bounds(y, x),
      content,
      contentFormat: "text",
      translationPolicy: "include",
    })
    const paragraphs = pageParagraphs(
      page({
        blocks: [
          line(0, 100, "Recurrent models factor computation along the symbol positions"),
          line(1, 112, "of the input and output sequences."),
          line(2, 140, "Attention mechanisms have become an integral part of sequence models."),
        ],
      }),
    )
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      "Recurrent models factor computation along the symbol positions of the input and output sequences.",
      "Attention mechanisms have become an integral part of sequence models.",
    ])
  })
})
