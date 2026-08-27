import { describe, expect, it } from "vitest"
import {
  type BoundingBox,
  computeConnectedVisualBounds,
  type VisualComponent,
} from "../../src/renderer/lib/pdfFeatureDetection"

describe("pdfFeatureDetection", () => {
  it("computes bounding box for single visual component above caption", () => {
    const caption: BoundingBox = { x: 50, y: 300, width: 200, height: 20 }
    const components: VisualComponent[] = [{ x: 50, y: 100, width: 200, height: 180 }]

    const result = computeConnectedVisualBounds(caption, components, {
      searchDirection: "above",
    })

    expect(result).toEqual({
      x: 50,
      y: 100,
      width: 200,
      height: 180,
    })
  })

  it("unions multiple sub-panel components for a multi-part figure", () => {
    const caption: BoundingBox = { x: 50, y: 350, width: 500, height: 20 }
    const components: VisualComponent[] = [
      { x: 50, y: 100, width: 200, height: 220 },
      { x: 300, y: 100, width: 250, height: 220 },
    ]

    const result = computeConnectedVisualBounds(caption, components, {
      searchDirection: "above",
    })

    expect(result).toEqual({
      x: 50,
      y: 100,
      width: 500,
      height: 220,
    })
  })

  it("computes table bounds below caption", () => {
    const caption: BoundingBox = { x: 50, y: 100, width: 300, height: 20 }
    const components: VisualComponent[] = [{ x: 50, y: 130, width: 450, height: 200 }]

    const result = computeConnectedVisualBounds(caption, components, {
      searchDirection: "below",
    })

    expect(result).toEqual({
      x: 50,
      y: 130,
      width: 450,
      height: 200,
    })
  })

  it("ignores page background rectangles", () => {
    const caption: BoundingBox = { x: 50, y: 350, width: 500, height: 20 }
    const components: VisualComponent[] = [
      { x: 0, y: 0, width: 595, height: 790 },
      { x: 60, y: 80, width: 480, height: 250 },
    ]

    const result = computeConnectedVisualBounds(caption, components, {
      searchDirection: "above",
      pageWidth: 600,
      pageHeight: 800,
    })

    expect(result).toEqual({
      x: 60,
      y: 80,
      width: 480,
      height: 250,
    })
  })

  it("excludes caption area when component overlaps with caption", () => {
    const caption: BoundingBox = { x: 50, y: 300, width: 400, height: 30 }
    const components: VisualComponent[] = [{ x: 50, y: 100, width: 400, height: 210 }]

    const result = computeConnectedVisualBounds(caption, components, {
      searchDirection: "above",
    })

    expect(result).not.toBeNull()
    if (result !== null) {
      expect(result.y + result.height).toBeLessThanOrEqual(caption.y)
    }
  })
})
