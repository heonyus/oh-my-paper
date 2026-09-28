import { describe, expect, it } from "vitest"
import {
  clampZoom,
  fitWorldRectHorizontally,
  focusWorldRect,
  moveWorldPointByScreenDelta,
  nextWheelAxis,
  panViewport,
  revealWorldRectHorizontally,
  wheelPanDelta,
  zoomViewportAt,
} from "../../src/renderer/lib/viewport"

describe("board viewport", () => {
  it("keeps the world point under the cursor when zooming", () => {
    // Given
    const viewport = { x: -240, y: -180, zoom: 0.72 }
    const cursor = { x: 640, y: 360 }

    // When
    const next = zoomViewportAt(viewport, cursor, 1.12)

    // Then
    expect((cursor.x - viewport.x) / viewport.zoom).toBeCloseTo((cursor.x - next.x) / next.zoom)
    expect((cursor.y - viewport.y) / viewport.zoom).toBeCloseTo((cursor.y - next.y) / next.zoom)
  })

  it("clamps zoom to the design contract", () => {
    // Given / When / Then
    expect(clampZoom(0.1)).toBe(0.38)
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(8)).toBe(4)
  })

  it("pans in screen pixels without changing zoom", () => {
    // Given
    const viewport = { x: 10, y: 20, zoom: 0.72 }

    // When
    const next = panViewport(viewport, { x: -40, y: 32 })

    // Then
    expect(next).toEqual({ x: -30, y: 52, zoom: 0.72 })
  })

  it("locks a mostly vertical trackpad gesture to the vertical axis", () => {
    // Given / When
    const delta = wheelPanDelta({ x: 7, y: 100 }, false)

    // Then
    expect(delta).toEqual({ x: 0, y: -100 })
  })

  it("maps shift-wheel to intentional horizontal panning", () => {
    // Given / When
    const delta = wheelPanDelta({ x: 0, y: 100 }, true)

    // Then
    expect(delta).toEqual({ x: -100, y: 0 })
  })

  it("converts card drag distance from screen pixels to world units", () => {
    // Given / When
    const point = moveWorldPointByScreenDelta({ x: 100, y: 200 }, { x: 150, y: -75 }, 1.5)

    // Then
    expect(point).toEqual({ x: 200, y: 150 })
  })

  it("pans just enough to reveal a newly created card beside the paper", () => {
    const next = revealWorldRectHorizontally(
      { x: 0, y: 20, zoom: 1.06 },
      824,
      { x: 760, width: 320 },
      16,
    )

    expect(next.x + (760 + 320) * next.zoom).toBeCloseTo(808)
    expect(next.y).toBe(20)
  })

  it("fits a PDF and its page-adjacent translation into the board width", () => {
    const next = fitWorldRectHorizontally(
      { x: 88, y: 36, zoom: 0.9 },
      1152,
      { x: 300, y: 64, width: 1420 },
      16,
    )

    expect(next.x + 300 * next.zoom).toBeCloseTo(16)
    expect(next.x + (300 + 1420) * next.zoom).toBeCloseTo(1136)
    expect(next.y + 64 * next.zoom).toBeCloseTo(36 + 64 * 0.9)
  })

  it("focuses a board card inside the available viewport", () => {
    const next = focusWorldRect(
      { x: 0, y: 0, zoom: 0.8 },
      { width: 1000, height: 700 },
      { x: 1200, y: 900, width: 320, height: 220 },
    )

    expect(next.x + (1200 + 320 / 2) * next.zoom).toBeCloseTo(640)
    expect(next.y + 900 * next.zoom).toBeCloseTo(84)
  })

  it("locks a trackpad stroke only to a clearly dominant axis and lets it switch", () => {
    expect(nextWheelAxis(null, { x: 3, y: 40 })).toBe("y")
    expect(nextWheelAxis(null, { x: 30, y: 4 })).toBe("x")
    expect(nextWheelAxis(null, { x: 20, y: 18 })).toBeNull()
    expect(nextWheelAxis(null, { x: 0, y: 0 })).toBeNull()
    expect(nextWheelAxis("y", { x: 40, y: 2 })).toBe("x")
    expect(nextWheelAxis("y", { x: 10, y: 8 })).toBe("y")
    expect(wheelPanDelta({ x: 20, y: 18 }, false)).toEqual({ x: -20, y: -18 })
  })
})
