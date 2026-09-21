import { describe, expect, it } from "vitest"
import { adoptRefinedVisualBounds } from "../../src/renderer/lib/pdfFeatureDom"
import {
  captionInkSearchRegion,
  expandBoundsWithinPage,
  hasPlausibleInkCoverage,
} from "../../src/renderer/lib/pdfInkRegion"

describe("caption ink search region", () => {
  it("uses the detected figure candidate while allowing vertical block recovery", () => {
    const candidate = { x: 580, y: 650, width: 560, height: 220 }
    const caption = { x: 610, y: 890, width: 500, height: 20 }

    const region = captionInkSearchRegion(caption, candidate, 1_200, 1_200, "figure")

    expect(region.x).toBe(564)
    expect(region.y).toBeLessThan(candidate.y)
    expect(region.y + region.height).toBe(caption.y - 2)
  })

  it("retains the full detected width for a table", () => {
    const candidate = { x: 40, y: 300, width: 1_120, height: 300 }
    const caption = { x: 180, y: 620, width: 500, height: 20 }

    const region = captionInkSearchRegion(caption, candidate, 1_200, 1_200, "table")

    expect(region.x).toBe(37)
    expect(region.width).toBe(1_126)
  })

  it("rejects a tiny ink fragment as the bound for a sparse chart", () => {
    const candidate = { x: 80, y: 110, width: 270, height: 105 }

    expect(hasPlausibleInkCoverage(candidate, { x: 364, y: 207, width: 24, height: 18 })).toBe(
      false,
    )
    expect(hasPlausibleInkCoverage(candidate, { x: 84, y: 114, width: 260, height: 96 })).toBe(true)
  })

  it("accepts a centered figure that occupies a third of a full-column fallback", () => {
    const candidate = { x: 0, y: 181, width: 734, height: 304 }
    const figureInk = { x: 236.5, y: 87.5, width: 261.5, height: 385 }

    expect(hasPlausibleInkCoverage(candidate, figureInk)).toBe(false)
    expect(hasPlausibleInkCoverage(candidate, figureInk, 0.28)).toBe(true)
  })

  it("adds safe equation padding without leaving the page", () => {
    expect(expandBoundsWithinPage({ x: 2, y: 3, width: 80, height: 12 }, 5, 600, 800)).toEqual({
      x: 0,
      y: 0,
      width: 87,
      height: 20,
    })
  })

  it("clamps visual bounds and rejects unrelated pixel regions", () => {
    const candidate = { x: -10, y: 20, width: 220, height: 180 }

    expect(adoptRefinedVisualBounds(candidate, null, 200, 200)).toEqual({
      x: 0,
      y: 20,
      width: 200,
      height: 180,
    })
    expect(
      adoptRefinedVisualBounds(candidate, { x: 160, y: 160, width: 40, height: 40 }, 200, 200),
    ).toEqual({ x: 0, y: 20, width: 200, height: 180 })
    expect(
      adoptRefinedVisualBounds(candidate, { x: 12, y: 34, width: 176, height: 150 }, 200, 200),
    ).toEqual({ x: 12, y: 34, width: 176, height: 150 })
    expect(
      adoptRefinedVisualBounds(candidate, { x: 12, y: 34, width: 176, height: 120 }, 200, 200, 0.7),
    ).toEqual({ x: 0, y: 20, width: 200, height: 180 })
  })
})
