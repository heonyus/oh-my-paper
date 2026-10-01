import { describe, expect, it } from "vitest"
import { equationLatex, equationRegions } from "../../src/renderer/lib/pageTranslationEquations"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"
import {
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../../src/shared/documentPageModel"

const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

/** The correction factor of a two-column methods page, as the layout model reads it. */
const correction =
  "s=\\frac{\\left(\\frac{1}{prev_{e}(\\mathrm{HiRID})}-1\\right)}{\\left(\\frac{1}{prev_{e}(\\mathrm{MIMIC})}-1\\right)}"

describe("display equation LaTeX", () => {
  it("takes the LaTeX out of its display delimiters", () => {
    expect(equationLatex(`$$\n${correction}\n$$`)).toBe(correction)
    expect(equationLatex("\\[ y^{2} \\]")).toBe("y^{2}")
  })

  it("sets the equation number the parser joined to it as a tag", () => {
    expect(equationLatex("$$\nx=\\frac{a}{b} (3)\n$$")).toBe("x=\\frac{a}{b} \\tag{3}")
    expect(equationLatex("$$\nx=1 \\tag{2}\n$$")).toBe("x=1 \\tag{2}")
  })

  it("gives up on text that is no display math or that KaTeX cannot typeset", () => {
    expect(equationLatex("MAP = 65 mmHg")).toBeNull()
    expect(equationLatex("$$\n\\frac{1}{\n$$")).toBeNull()
    expect(equationLatex("$$\n\\notacommand{x}\n$$")).toBeNull()
    expect(equationLatex("$$  $$")).toBeNull()
  })
})

describe("equations typeset in the page layout", () => {
  const page: ParsedDocumentPage = parsedDocumentPageSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash: "d".repeat(64),
    parser: "PDF.js+PaddleOCR-VL-1.6",
    configVersion: "hybrid-v13",
    pageNumber: 14,
    width: 1_000,
    height: 1_400,
    blocks: [],
    layout: [
      { label: "text", order: 0, bounds: bounds(80, 100, 420, 120), content: "We downscale…" },
      { label: "equation", order: 1, bounds: bounds(200, 230, 180, 60), content: correction },
      { label: "text", order: 2, bounds: bounds(80, 300, 420, 60), content: "to satisfy…" },
    ],
  })
  const block = (
    id: string,
    source: string,
    box: ReturnType<typeof bounds> | undefined,
    structureKind: PageTranslationBlock["structureKind"] = "equation",
  ): PageTranslationBlock => ({
    id,
    parsedBlockId: id,
    kind: "body",
    structureKind,
    source,
    translation: source,
    ...(box ? { sourceBounds: box } : {}),
    sourcePageWidth: 1_000,
    sourcePageHeight: 1_400,
  })
  const regions = equationRegions(
    [
      block("page:14:block:1", `$$\n${correction}\n$$`, bounds(200, 230, 180, 60)),
      // An inline formula the layout model boxed inside running text.
      block("page:14:block:2", "$$\nprev_{e}\n$$", bounds(300, 150, 40, 14)),
      // A line PDF.js text alone took for an equation: no LaTeX to typeset.
      block("page:14:block:3", "MAP = 65 mmHg", bounds(200, 380, 180, 20)),
      block("page:14:block:4", "$$\nx=1\n$$", undefined),
      block("page:14:block:5", "$$\nx=1\n$$", bounds(200, 420, 180, 20), "body"),
    ],
    page,
  )

  it("typesets a display equation from its LaTeX across its column, over its source box", () => {
    expect(regions).toEqual([
      {
        id: "equation:page:14:block:1",
        blockIds: ["page:14:block:1"],
        kind: "equation",
        rect: { x: 0.08, y: 230 / 1_400, width: 0.42, height: 60 / 1_400 },
        translation: `$$\n${correction}\n$$`,
        mask: { x: 0.2, y: 230 / 1_400, width: 0.18, height: 60 / 1_400 },
      },
    ])
  })

  it("keeps an equation numbered at the column's edge, or with no column around it, in its box", () => {
    const numbered = equationRegions(
      [block("page:14:block:1", "$$\nx=1 (2)\n$$", bounds(300, 230, 200, 60))],
      page,
    )
    expect(numbered[0]?.rect).toEqual(numbered[0]?.mask)
    expect(numbered[0]?.translation).toBe("$$\nx=1 \\tag{2}\n$$")
    const alone = equationRegions(
      [block("page:14:block:1", "$$\nx=1\n$$", bounds(600, 230, 180, 60))],
      page,
    )
    expect(alone[0]?.rect).toEqual(alone[0]?.mask)
  })
})
