import { describe, expect, it } from "vitest"
import { pixelWheel, wheelZoomFactor } from "../../src/renderer/lib/useBoardGestures"

describe("Ctrl+wheel zoom", () => {
  it("zooms a Windows mouse-wheel notch by about a browser zoom step", () => {
    // Chromium on Windows sends 100 px per notch.
    expect(wheelZoomFactor(-100, false)).toBeCloseTo(1.155, 3)
    expect(wheelZoomFactor(100, false)).toBeCloseTo(0.866, 3)
  })

  it("leaves a trackpad pinch, and anything on an Apple keyboard, as it was", () => {
    expect(wheelZoomFactor(-4, false)).toBeCloseTo(Math.exp(0.024), 6)
    expect(wheelZoomFactor(-100, true)).toBeCloseTo(Math.exp(0.6), 6)
  })
})

describe("wheel deltas", () => {
  it("counts lines and pages in pixels, and keeps pixel deltas", () => {
    const lines = pixelWheel(new WheelEvent("wheel", { deltaY: 3, deltaMode: 1 }), 800)
    const pages = pixelWheel(new WheelEvent("wheel", { deltaY: 1, deltaMode: 2 }), 800)
    const pixels = new WheelEvent("wheel", { deltaY: 100, ctrlKey: true })
    expect(lines.deltaY).toBe(48)
    expect(pages.deltaY).toBe(800)
    expect(pixelWheel(pixels, 800)).toBe(pixels)
    expect(lines.ctrlKey).toBe(false)
    expect(() => lines.preventDefault()).not.toThrow()
  })
})
