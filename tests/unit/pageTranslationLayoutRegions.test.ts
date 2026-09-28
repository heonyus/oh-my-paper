import { describe, expect, it } from "vitest"
import {
  backgroundColor,
  columnRuns,
  fitFontSize,
  layoutRegions,
  regionBottomLimit,
} from "../../src/renderer/lib/pageTranslationLayoutRegions"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"

function block(
  id: string,
  parsedBlockId: string,
  translation: string,
  overrides: Partial<PageTranslationBlock> = {},
): PageTranslationBlock {
  return {
    id,
    parsedBlockId,
    kind: "body",
    structureKind: "body",
    source: `source ${id}`,
    translation,
    sourceBounds: { x: 100, y: 200, width: 400, height: 100 },
    sourcePageWidth: 1_000,
    sourcePageHeight: 2_000,
    ...overrides,
  }
}

describe("layout-preserving translation regions", () => {
  it("joins a paragraph's sentence translations into its source box", () => {
    const regions = layoutRegions([
      block("p:1:sentence:1", "p:1", "첫 문장입니다."),
      block("p:1:sentence:2", "p:1", " 둘째 문장입니다. "),
      block("p:2", "p:2", "## 결과", {
        kind: "heading",
        structureKind: "heading",
        sourceBounds: { x: 100, y: 120, width: 80, height: 20 },
      }),
    ])

    expect(regions).toEqual([
      {
        id: "p:1",
        blockIds: ["p:1:sentence:1", "p:1:sentence:2"],
        kind: "body",
        rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
        translation: "첫 문장입니다. 둘째 문장입니다.",
      },
      {
        id: "p:2",
        blockIds: ["p:2"],
        kind: "heading",
        rect: { x: 0.1, y: 0.06, width: 0.08, height: 0.01 },
        translation: "결과",
      },
    ])
  })

  it("leaves figures, tables, equations and unplaced blocks to the original page", () => {
    const { sourceBounds: _bounds, ...unplaced } = block("n", "n", "위치 없음")
    const regions = layoutRegions([
      block("f", "f", "원본 그림", { structureKind: "figure" }),
      block("t", "t", "<table></table>", { structureKind: "table" }),
      block("e", "e", "$$x$$", { structureKind: "equation" }),
      unplaced,
    ])

    expect(regions).toEqual([])
  })

  it("keeps a region that is still waiting for its translation, with empty text", () => {
    const [region] = layoutRegions([block("p:1:sentence:1", "p:1", "")])

    expect(region?.translation).toBe("")
  })

  it("lets a region grow only until the next box in its column", () => {
    const region = { x: 0.1, y: 0.1, width: 0.4, height: 0.1 }
    const below = { x: 0.1, y: 0.3, width: 0.4, height: 0.1 }
    const otherColumn = { x: 0.55, y: 0.21, width: 0.35, height: 0.1 }

    expect(regionBottomLimit(region, [region, below, otherColumn])).toBeCloseTo(0.296)
    expect(regionBottomLimit(region, [region, otherColumn])).toBeCloseTo(0.96)
  })

  it("finds the largest size that fits and reports when nothing does", () => {
    const fitted = fitFontSize((size) => size <= 1.37, 1.6, 1.28, 10)
    expect(fitted.fits).toBe(true)
    expect(fitted.size).toBeGreaterThan(1.36)
    expect(fitted.size).toBeLessThanOrEqual(1.37)

    expect(fitFontSize(() => true, 1.6, 1.28)).toEqual({ size: 1.6, fits: true })
    expect(fitFontSize(() => false, 1.6, 0.96)).toEqual({ size: 0.96, fits: false })
  })

  it("reads the paper colour around a region even with glyph pixels mixed in", () => {
    const paper = [248, 246, 240, 255]
    const ink = [20, 20, 20, 255]
    const pixels = new Uint8ClampedArray([...paper, ...ink, ...paper, ...paper, ...ink, ...paper])

    expect(backgroundColor(pixels)).toBe("rgb(248 246 240)")
    expect(backgroundColor(new Uint8ClampedArray())).toBe("rgb(255 255 255)")
  })

  it("runs paragraphs down a column until a gap, a heading or the other column", () => {
    const region = (id: string, x: number, y: number, height: number) => ({
      id,
      blockIds: [id],
      kind: "body" as const,
      rect: { x, y, width: 0.4, height },
      translation: id,
    })
    const first = region("a", 0.07, 0.1, 0.08)
    const touching = region("b", 0.07, 0.185, 0.05)
    const afterHeading = region("c", 0.07, 0.26, 0.05)
    const farBelow = region("d", 0.07, 0.4, 0.05)
    const otherColumn = region("e", 0.51, 0.1, 0.1)
    const heading = { x: 0.07, y: 0.24, width: 0.1, height: 0.012 }

    const runs = columnRuns([first, touching, afterHeading, farBelow, otherColumn], [heading])

    expect(runs.map((run) => run.map((item) => item.id))).toEqual([["a", "b"], ["c"], ["d"], ["e"]])
  })

  it("does not run a caption set in smaller type into the body text above it", () => {
    const typeset = (id: string, y: number, fontSize: number) => ({
      id,
      blockIds: [id],
      kind: "body" as const,
      rect: { x: 0.07, y, width: 0.4, height: 0.05 },
      translation: id,
      typography: { fontSize, lineHeight: 1.3, indent: 0, hang: 0, bullet: false },
    })

    const runs = columnRuns([typeset("body", 0.1, 1.4), typeset("caption", 0.155, 1.1)], [])

    expect(runs.map((run) => run.map((item) => item.id))).toEqual([["body"], ["caption"]])
  })
})
