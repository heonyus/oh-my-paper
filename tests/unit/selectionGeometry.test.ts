import { describe, expect, it } from "vitest"
import {
  mergeSelectionFragments,
  rectsToElementSpace,
  SOURCE_FRAGMENTS_MAX,
} from "../../src/renderer/lib/selectionGeometry"

describe("selection geometry", () => {
  it("uses the rendered world bounds when React viewport state is stale", () => {
    const fragments = rectsToElementSpace(
      [{ left: 300, top: 240, width: 106, height: 21.2 }],
      { left: -150, top: -80, width: 5_088, height: 6_784 },
      { width: 4_800, height: 6_400 },
    )
    const fragment = fragments[0]

    expect(fragment?.x).toBeCloseTo(424.5283)
    expect(fragment?.y).toBeCloseTo(301.8868)
    expect(fragment?.width).toBeCloseTo(100)
    expect(fragment?.height).toBeCloseTo(20)
  })

  it("merges a line's span rects into one, keeping lines and columns apart", () => {
    const merged = mergeSelectionFragments([
      // Line 1 in the left column: a span box, its text and a neighbouring span.
      { x: 10, y: 100, width: 80, height: 12 },
      { x: 10, y: 101, width: 78, height: 10 },
      { x: 92, y: 100, width: 60, height: 12 },
      // Line 2.
      { x: 10, y: 114, width: 140, height: 12 },
      // The right column's first line, level with line 1 but far away.
      { x: 320, y: 100, width: 120, height: 12 },
    ])

    expect(merged).toEqual([
      { x: 10, y: 100, width: 142, height: 12 },
      { x: 10, y: 114, width: 140, height: 12 },
      { x: 320, y: 100, width: 120, height: 12 },
    ])
  })

  it("keeps a very long selection within what an anchor can save", () => {
    const lines = Array.from({ length: 300 }, (_, index) => ({
      x: 10,
      y: index * 14,
      width: 140,
      height: 12,
    }))

    const merged = mergeSelectionFragments(lines)

    // Runs of three lines, the last reaching the last line's bottom (299 × 14 + 12).
    expect(merged).toHaveLength(100)
    expect(merged.length).toBeLessThanOrEqual(SOURCE_FRAGMENTS_MAX)
    expect(merged[0]).toEqual({ x: 10, y: 0, width: 140, height: 40 })
    expect(merged.at(-1)).toEqual({ x: 10, y: 4_158, width: 140, height: 40 })
  })
})
