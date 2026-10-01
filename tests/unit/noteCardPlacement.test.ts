import { afterEach, describe, expect, it } from "vitest"
import {
  movedPlacement,
  noteCardPlacement,
} from "../../src/renderer/components/noteCard/noteCardPlacement"

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return DOMRect.fromRect({ x: left, y: top, width, height })
}

/** A board scrolled to (-200, -1000) at 2× zoom inside a viewport at (0, 100). */
function board(): void {
  const viewport = document.createElement("div")
  const world = document.createElement("div")
  world.className = "board-world"
  viewport.append(world)
  document.body.append(viewport)
  viewport.getBoundingClientRect = () => rect(0, 100, 1000, 600)
  world.getBoundingClientRect = () => rect(-200, -900, 9600, 12800)
  Object.defineProperty(world, "offsetWidth", { value: 4800 })
}

afterEach(() => document.body.replaceChildren())

describe("note card placement", () => {
  it("pins a card on a paper to the board point under the pointer", () => {
    board()
    expect(noteCardPlacement(true, { x: 400, y: 300 })).toEqual({ kind: "board", x: 300, y: 600 })
    // Away from the board it opens in the board's middle third instead.
    expect(noteCardPlacement(true, { x: 1200, y: 50 })).toEqual({
      kind: "board",
      x: 350,
      y: 600,
    })
  })

  it("floats elsewhere at the pointer, kept inside the window", () => {
    board()
    expect(noteCardPlacement(false, { x: 40, y: 60 })).toEqual({
      kind: "screen",
      left: 40,
      top: 60,
    })
    const far = noteCardPlacement(false, { x: 99_999, y: 99_999 })
    expect(far.kind === "screen" && far.left < window.innerWidth).toBe(true)
  })

  it("moves a pinned card by screen pixels divided by the zoom", () => {
    expect(movedPlacement({ kind: "board", x: 300, y: 600 }, 40, -20, 2)).toEqual({
      kind: "board",
      x: 320,
      y: 590,
    })
    expect(movedPlacement({ kind: "screen", left: 10, top: 10 }, 5, 5, 2)).toEqual({
      kind: "screen",
      left: 15,
      top: 15,
    })
  })
})
