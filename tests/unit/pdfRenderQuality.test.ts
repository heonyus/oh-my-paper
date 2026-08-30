import { describe, expect, it } from "vitest"
import { alignedDevicePixel } from "../../src/renderer/lib/pdfRenderQuality"

describe("PDF render quality", () => {
  it("aligns the paper surface to the physical Retina pixel grid", () => {
    expect(alignedDevicePixel(216.37, 2)).toBe(216.5)
    expect(alignedDevicePixel(216.37, 1)).toBe(216)
  })
})
