import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, it } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import {
  citationIndexFromAst,
  outlineFromAst,
  pageSourceBlocksFromAst,
  pageTextsFromAst,
  preparedSummaryFromAst,
  structuresFromAst,
} from "../../src/renderer/lib/documentAstProjection"

function textItem(text: string, x: number, baseline: number): TextItem {
  return {
    str: text,
    dir: "ltr",
    transform: [10, 0, 0, 10, x, baseline],
    width: text.length * 6,
    height: 10,
    fontName: "Helvetica",
    hasEOL: false,
  }
}

function ast() {
  return buildSourceDocumentAst("a".repeat(64), [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [
        textItem("Introduction", 40, 740),
        textItem("Figure 1. Synthetic chart", 40, 700),
        textItem("Prior work [3]", 40, 660),
      ],
    },
  ])
}

describe("document AST projections", () => {
  it("projects legacy page, summary, outline, structure, block, and citation views", () => {
    const source = ast()
    const pageTexts = pageTextsFromAst(source)
    const outline = outlineFromAst(source)
    const structures = structuresFromAst(source)
    const blocks = pageSourceBlocksFromAst(source, 1)
    const citations = citationIndexFromAst(source)

    expect(pageTexts[0]).toBe("Introduction Figure 1. Synthetic chart Prior work [3]")
    expect(preparedSummaryFromAst(source, { title: "Synthetic", kind: "document" })).toMatchObject({
      pages: 1,
      title: "Synthetic",
      textCharacters: pageTexts[0]?.length,
    })
    expect(outline[0]).toMatchObject({ title: "Introduction", sourceItemId: "item:1.0" })
    expect(structures[0]).toMatchObject({
      id: "item:1.1",
      kind: "figure",
      sourceRange: { sourceItemId: "item:1.1" },
    })
    expect(blocks.map((block) => block.source)).toEqual([
      "Introduction",
      "Figure 1. Synthetic chart",
      "Prior work [3]",
    ])
    expect(citations[0]).toMatchObject({ key: "3", sourceRanges: [{ sourceItemId: "item:1.2" }] })
  })
})
