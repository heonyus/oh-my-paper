import { describe, expect, it } from "vitest"
import { buildNativeParsedPage } from "../../src/electron/nativeTextPageParser"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { sha256Schema } from "../../src/shared/schemas"

describe("nativeTextPageParser", () => {
  it("keeps PDF stream order for inline subscripts with offset geometry", () => {
    const sourceHash = sha256Schema.parse("b".repeat(64))
    const ast = buildSourceDocumentAst(sourceHash, [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [
          {
            str: "Value d",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 700],
            width: 45,
            height: 10,
            fontName: "Helvetica",
            hasEOL: false,
          },
          {
            str: "k",
            dir: "ltr",
            transform: [7, 0, 0, 7, 96, 696],
            width: 6,
            height: 7,
            fontName: "Helvetica",
            hasEOL: false,
          },
          {
            str: " remains stable.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 104, 700],
            width: 90,
            height: 10,
            fontName: "Helvetica",
            hasEOL: true,
          },
        ],
      },
    ])

    const result = buildNativeParsedPage({ ast, pageNumber: 1, sourceHash })

    expect(result?.status).toBe("ready")
    if (result?.status === "ready") {
      expect(result.page.blocks.map((block) => block.content)).toEqual([
        "Value d k remains stable.",
      ])
    }
  })

  it("limits caption continuation and keeps later Table references as body text", () => {
    const sourceHash = sha256Schema.parse("e".repeat(64))
    const ast = buildSourceDocumentAst(sourceHash, [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [
          {
            str: "Table 2: BLEU scores and training",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 700],
            width: 300,
            height: 10,
            fontName: "Helvetica",
            hasEOL: true,
          },
          {
            str: "cost for each model.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 685],
            width: 160,
            height: 10,
            fontName: "Helvetica",
            hasEOL: true,
          },
          {
            str: "Model BLEU Training Cost",
            dir: "ltr",
            transform: [14, 0, 0, 14, 50, 670],
            width: 190,
            height: 14,
            fontName: "Helvetica",
            hasEOL: true,
          },
          {
            str: "Residual Dropout applies to every layer.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 650],
            width: 260,
            height: 10,
            fontName: "Helvetica",
            hasEOL: true,
          },
          {
            str: "Table 2 summarizes our results.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 630],
            width: 220,
            height: 10,
            fontName: "Helvetica",
            hasEOL: true,
          },
        ],
      },
    ])

    const result = buildNativeParsedPage({ ast, pageNumber: 1, sourceHash })

    expect(result?.status).toBe("ready")
    if (result?.status === "ready") {
      expect(result.page.blocks.map((block) => block.label)).toEqual([
        "table_title",
        "text",
        "text",
        "text",
      ])
      expect(result.page.blocks[0]?.content).toBe(
        "Table 2: BLEU scores and training cost for each model.",
      )
    }
  })

  it("builds a valid ParsedDocumentPage from SourceDocumentAst for digital text without Paddle", () => {
    const sourceHash = sha256Schema.parse("c".repeat(64))
    const ast = buildSourceDocumentAst(sourceHash, [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [
          {
            str: "3.2.1 Scaled Dot-Product Attention",
            dir: "ltr",
            transform: [14, 0, 0, 14, 50, 720],
            width: 150,
            height: 14,
            fontName: "Helvetica-Bold",
            hasEOL: true,
          },
          {
            str: "This is a digital text paragraph demonstrating local parsing.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 680],
            width: 300,
            height: 10,
            fontName: "Helvetica",
            hasEOL: true,
          },
        ],
      },
    ])

    const parsed = buildNativeParsedPage({
      ast,
      pageNumber: 1,
      sourceHash,
      width: 600,
      height: 800,
    })

    expect(parsed).not.toBeNull()
    expect(parsed?.status).toBe("ready")
    if (parsed?.status === "ready") {
      expect(parsed.page.sourceHash).toBe(sourceHash)
      expect(parsed.page.pageNumber).toBe(1)
      expect(parsed.page.parser).toBe("NativeText-1.0")
      expect(parsed.page.blocks.length).toBeGreaterThan(0)
      expect(parsed.page.blocks[0]?.content).toContain("3.2.1 Scaled Dot-Product Attention")
      expect(parsed.page.blocks[0]?.label).toBe("paragraph_title")
    }
  })

  it("preserves two-column reading order and translates figure/table captions", () => {
    const sourceHash = sha256Schema.parse("d".repeat(64))
    const ast = buildSourceDocumentAst(sourceHash, [
      {
        page: 1,
        width: 600,
        height: 800,
        items: [
          {
            str: "Header Title of the Page",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 750],
            width: 500,
            height: 10,
            fontName: "H",
            hasEOL: true,
          },
          {
            str: "Left column paragraph line one.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 650],
            width: 200,
            height: 10,
            fontName: "H",
            hasEOL: true,
          },
          {
            str: "Left column paragraph line two.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 630],
            width: 200,
            height: 10,
            fontName: "H",
            hasEOL: true,
          },
          {
            str: "Right column paragraph line one.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 350, 650],
            width: 200,
            height: 10,
            fontName: "H",
            hasEOL: true,
          },
          {
            str: "Right column paragraph line two.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 350, 630],
            width: 200,
            height: 10,
            fontName: "H",
            hasEOL: true,
          },
          {
            str: "Figure 1: Overall architecture overview.",
            dir: "ltr",
            transform: [10, 0, 0, 10, 50, 400],
            width: 300,
            height: 10,
            fontName: "H",
            hasEOL: true,
          },
        ],
      },
    ])

    const result = buildNativeParsedPage({
      ast,
      pageNumber: 1,
      sourceHash,
      width: 600,
      height: 800,
    })
    expect(result).not.toBeNull()
    expect(result?.status).toBe("ready")
    if (result?.status === "ready") {
      const contents = result.page.blocks.map((b) => b.content)
      expect(contents[0]).toContain("Header Title")
      const leftCol2 = contents.findIndex((c) => c.includes("Left column paragraph line two"))
      const rightCol1 = contents.findIndex((c) => c.includes("Right column paragraph line one"))
      expect(leftCol2).toBeLessThan(rightCol1)
      const caption = result.page.blocks.find((b) => b.content.startsWith("Figure 1:"))
      expect(caption?.label).toBe("figure_title")
      expect(caption?.translationPolicy).toBe("include")
    }
  })
})
