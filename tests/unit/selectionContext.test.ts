import { describe, expect, it } from "vitest"
import type { BoardTextSelection } from "../../src/renderer/lib/boardSelection"
import { addSelectionContext } from "../../src/renderer/lib/selectionContext"

type Box = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function setBox(element: Element, box: Box): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => box,
    }),
  })
}

function addSpan(page: HTMLElement, text: string, box: Box): void {
  const span = document.createElement("span")
  span.textContent = text
  setBox(span, box)
  page.querySelector(".textLayer")?.append(span)
}

const selection: BoardTextSelection = {
  page: 1,
  quote: "selected\nphrase",
  fragments: [{ x: 0, y: 0, width: 100, height: 12 }],
  cardPosition: { x: 120, y: 0 },
  context: { before: "", after: "" },
}

describe("selection context", () => {
  it("includes nearby page text around the selected quote", () => {
    const page = document.createElement("article")
    const layer = document.createElement("div")
    layer.className = "textLayer"
    layer.innerHTML = "<span>Before selected phrase after</span>"
    page.append(layer)

    const contextual = addSelectionContext(selection, page)

    expect(contextual.context.before).toBe("Before ")
    expect(contextual.context.after).toBe(" after")
  })

  it("adds the complete section when the selected quote is an unnumbered heading", () => {
    const viewer = document.createElement("div")
    viewer.className = "board-viewport"
    const page = document.createElement("article")
    page.className = "page"
    page.setAttribute("data-page-number", "5")
    setBox(page, { left: 0, top: 0, width: 800, height: 1_000 })
    const layer = document.createElement("div")
    layer.className = "textLayer"
    page.append(layer)
    addSpan(page, "Agent Scaffolds.", { left: 80, top: 800, width: 140, height: 16 })
    addSpan(page, "Following CodeAct, interactions are modeled as a POMDP.", {
      left: 230,
      top: 800,
      width: 490,
      height: 16,
    })
    addSpan(page, "request_info retrieves EHR data; terminal manages dependencies;", {
      left: 80,
      top: 860,
      width: 560,
      height: 16,
    })
    addSpan(page, "code_execution runs generated code;", {
      left: 80,
      top: 920,
      width: 360,
      height: 16,
    })
    addSpan(page, "debugging translates execution errors for LLM comprehension.", {
      left: 80,
      top: 955,
      width: 560,
      height: 16,
    })
    viewer.append(page)
    const headingSelection: BoardTextSelection = {
      ...selection,
      page: 5,
      quote: "Agent Scaffolds",
    }

    const contextual = addSelectionContext(headingSelection, page)

    expect(contextual.context.section).toContain("request_info")
    expect(contextual.context.section).toContain("terminal")
    expect(contextual.context.section).toContain("code_execution")
    expect(contextual.context.section).toContain("debugging translates execution errors")
  })
})
