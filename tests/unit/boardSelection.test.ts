import { describe, expect, it } from "vitest"
import { captureNativeBoardTextSelection } from "../../src/renderer/lib/boardSelection"

describe("native PDF.js selection capture", () => {
  it("stores PDF.js line rectangles in board-world coordinates", () => {
    const pageElement = document.createElement("article")
    pageElement.setAttribute("data-page-number", "3")
    const boardWorldElement = document.createElement("div")
    Object.defineProperties(boardWorldElement, {
      offsetWidth: { value: 4_800 },
      offsetHeight: { value: 6_400 },
      getBoundingClientRect: {
        value: () => ({ left: -150, top: -80, width: 5_088, height: 6_784 }),
      },
    })
    Object.defineProperty(pageElement, "getBoundingClientRect", {
      value: () => ({ left: 168, top: 120, right: 798, bottom: 960, width: 630, height: 840 }),
    })
    const range = document.createRange()
    Object.defineProperty(range, "getClientRects", {
      value: () => [{ left: 300, top: 240, width: 106, height: 21.2 }],
    })

    const selection = captureNativeBoardTextSelection({
      pageElement,
      boardWorldElement,
      range,
      quote: "selected PDF text",
    })

    expect(selection?.page).toBe(3)
    expect(selection?.quote).toBe("selected PDF text")
    expect(selection?.fragments[0]?.x).toBeCloseTo(424.5283)
    expect(selection?.fragments[0]?.width).toBeCloseTo(100)
  })
})
