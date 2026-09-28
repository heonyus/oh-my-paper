import { describe, expect, it } from "vitest"
import {
  centerViewportOnWorldPoint,
  constrainViewportToBounds,
  hasCompletePageSet,
  intersectWorldRects,
  mapMinimapPointToWorld,
  mergeWorldRects,
  symmetricBoardBounds,
  viewportWorldRect,
  worldRectToMinimap,
} from "../../src/renderer/lib/boardNavigation"

describe("board navigation", () => {
  it("does not constrain panning from a partial page measurement", () => {
    expect(hasCompletePageSet([{ x: 300, y: 64, width: 816, height: 1_056 }], 3)).toBe(false)
    expect(
      hasCompletePageSet(
        [
          { x: 300, y: 64, width: 816, height: 1_056 },
          { x: 300, y: 1_136, width: 816, height: 1_056 },
          { x: 300, y: 2_208, width: 816, height: 1_056 },
        ],
        3,
      ),
    ).toBe(true)
  })

  it("merges paper pages and cards into one finite navigation extent", () => {
    const bounds = mergeWorldRects([
      { x: 300, y: 64, width: 816, height: 1056 },
      { x: 300, y: 1136, width: 816, height: 1056 },
      { x: 1180, y: 240, width: 320, height: 420 },
    ])

    expect(bounds).toEqual({ x: 300, y: 64, width: 1200, height: 2128 })
  })

  it("mirrors card-side room around the paper with a minimum side workspace", () => {
    const bounds = symmetricBoardBounds(
      [
        { x: 300, y: 64, width: 816, height: 1056 },
        { x: 300, y: 1136, width: 816, height: 1056 },
      ],
      [{ x: 1180, y: 240, width: 600, height: 420 }],
      720,
    )

    expect(bounds).not.toBeNull()
    if (!bounds) return
    const leftRoom = 300 - bounds.x
    const rightRoom = bounds.x + bounds.width - (300 + 816)
    expect(leftRoom).toBe(720)
    expect(rightRoom).toBe(leftRoom)
    expect(bounds.y).toBe(64)
    expect(bounds.height).toBe(2128)
  })

  it("mirrors farther left-side cards to the right of the paper", () => {
    const bounds = symmetricBoardBounds(
      [{ x: 300, y: 64, width: 816, height: 1056 }],
      [{ x: -620, y: 240, width: 320, height: 420 }],
      720,
    )

    expect(bounds).toEqual({ x: -620, y: 64, width: 2656, height: 1056 })
  })

  it("clamps excessive top space and lets narrow content slide up to the view edges", () => {
    const bounds = { x: 300, y: 64, width: 816, height: 4_000 }
    const view = { width: 1_000, height: 700 }
    const left = constrainViewportToBounds({ x: -5_000, y: 1_000, zoom: 0.9 }, view, bounds, 40)
    const right = constrainViewportToBounds({ x: 5_000, y: 0, zoom: 0.9 }, view, bounds, 40)
    const between = constrainViewportToBounds({ x: -100, y: 0, zoom: 0.9 }, view, bounds, 40)

    expect(left.x + 300 * 0.9).toBeCloseTo(40)
    expect(left.y + 64 * 0.9).toBeCloseTo(40)
    expect(right.x + (300 + 816) * 0.9).toBeCloseTo(960)
    expect(between.x).toBe(-100)
  })

  it("reaches past the bounds by the slack and out from under a right overlay", () => {
    const next = constrainViewportToBounds(
      { x: -9_999, y: 0, zoom: 1 },
      { width: 1_000, height: 700 },
      { x: -420, y: 64, width: 2_256, height: 4_000 },
      40,
      { slack: 100, occludedRight: 340 },
    )

    expect(next.x + (-420 + 2_256)).toBeCloseTo(1_000 - 40 - 340 - 100)
  })

  it("keeps the bottom edge reachable without allowing endless blank canvas", () => {
    const next = constrainViewportToBounds(
      { x: 0, y: -9_999, zoom: 0.9 },
      { width: 1_000, height: 700 },
      { x: 300, y: 64, width: 816, height: 4_000 },
      40,
    )

    expect(next.y + (64 + 4_000) * 0.9).toBeCloseTo(660)
  })

  it("maps minimap pointers and viewport rectangles between screen and world space", () => {
    expect(
      mapMinimapPointToWorld(
        { x: 70, y: 90 },
        { left: 0, top: 0, width: 140, height: 180 },
        { x: 300, y: 64, width: 816, height: 4_000 },
      ),
    ).toEqual({ x: 708, y: 2_064 })
    expect(
      viewportWorldRect({ x: -300, y: -200, zoom: 0.5 }, { width: 1_000, height: 700 }),
    ).toEqual({ x: 600, y: 400, width: 2_000, height: 1_400 })
  })

  it("centers a minimap destination before applying finite bounds", () => {
    const next = centerViewportOnWorldPoint(
      { x: 0, y: 0, zoom: 1 },
      { width: 1_000, height: 700 },
      { x: 708, y: 2_064 },
      { x: 300, y: 64, width: 816, height: 4_000 },
      40,
    )

    expect(next.x).toBeCloseTo(-208)
    expect(next.y).toBeCloseTo(-1_714)
  })

  it("clips and normalizes the live viewport before drawing a tall-paper minimap", () => {
    const bounds = { x: 300, y: 64, width: 820, height: 46_232 }
    const visible = intersectWorldRects({ x: 190, y: 12, width: 1_472, height: 1_236 }, bounds)

    expect(visible).toEqual({ x: 300, y: 64, width: 820, height: 1_184 })
    const projected = worldRectToMinimap(visible ?? bounds, bounds)
    expect(projected).toMatchObject({ x: 0, y: 0, width: 100 })
    expect(projected.height).toBeCloseTo(2.56056)
  })
})
