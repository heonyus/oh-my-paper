import { describe, expect, it } from "vitest"
import {
  bottomAnchoredInkBounds,
  type InkMask,
  type MaskRect,
} from "../../src/renderer/lib/pdfInkBounds"

function maskWithRects(width: number, height: number, rects: readonly MaskRect[]): InkMask {
  const data = new Uint8Array(width * height)
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      data.fill(1, y * width + rect.x, y * width + rect.x + rect.width)
    }
  }
  return { data, width, height }
}

describe("bottomAnchoredInkBounds", () => {
  it("joins stacked visual panels while excluding separated prose above", () => {
    const mask = maskWithRects(40, 50, [
      { x: 4, y: 2, width: 30, height: 3 },
      { x: 6, y: 14, width: 26, height: 10 },
      { x: 5, y: 27, width: 28, height: 12 },
    ])

    const result = bottomAnchoredInkBounds(mask, {
      maxGap: 3,
      minRowInk: 2,
      maxDistanceFromBottom: 12,
    })

    expect(result).toEqual({ x: 5, y: 14, width: 28, height: 25 })
  })
})
