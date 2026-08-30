import { describe, expect, it } from "vitest"
import { sectionRequestContext } from "../../src/renderer/lib/sectionContext"

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

function makePage(number: number): HTMLElement {
  const element = document.createElement("div")
  element.className = "page"
  element.setAttribute("data-page-number", String(number))
  const textLayer = document.createElement("div")
  textLayer.className = "textLayer"
  element.append(textLayer)
  setBox(element, { left: 0, top: 0, width: 800, height: 1_000 })
  return element
}

describe("section request context", () => {
  it("continues section prose onto the next page while excluding table cells and the next heading", () => {
    // Given
    const viewer = document.createElement("div")
    const first = makePage(1)
    addSpan(first, "ABSTRACT", { left: 100, top: 100, width: 100, height: 20 })
    addSpan(first, "The paper builds a unified executable biomedical benchmark.", {
      left: 100,
      top: 140,
      width: 500,
      height: 14,
    })
    addSpan(first, "1 INTRODUCTION", { left: 100, top: 220, width: 160, height: 20 })
    const current = makePage(3)
    addSpan(current, "3.2 DATA CONSTRUCTION", { left: 100, top: 840, width: 300, height: 20 })
    addSpan(current, "Task and Data Identification explains the selection criteria.", {
      left: 100,
      top: 875,
      width: 500,
      height: 14,
    })
    addSpan(current, "3", { left: 395, top: 950, width: 10, height: 14 })
    const next = makePage(4)
    addSpan(next, "Published as a conference paper", {
      left: 100,
      top: 30,
      width: 300,
      height: 14,
    })
    addSpan(next, "Table 2 summarizes dataset statistics.", {
      left: 100,
      top: 100,
      width: 350,
      height: 14,
    })
    addSpan(next, "MIMIC-III 9,318 1,122", { left: 100, top: 140, width: 250, height: 8 })
    addSpan(next, "The benchmark standardizes tasks into executable environments.", {
      left: 100,
      top: 300,
      width: 500,
      height: 14,
    })
    addSpan(next, "3.3", { left: 100, top: 500, width: 35, height: 20 })
    addSpan(next, "CODING ENVIRONMENT", { left: 150, top: 500, width: 220, height: 20 })
    viewer.append(first, current, next)

    // When
    const context = sectionRequestContext({
      viewer,
      page: current,
      heading: "3.2 DATA CONSTRUCTION",
      bounds: { x: 100, y: 840, width: 300, height: 20 },
      paperTitle: "MedAgentGym",
    })

    // Then
    expect(context.paper).toContain("unified executable biomedical benchmark")
    expect(context.section).toContain("Task and Data Identification")
    expect(context.section).toContain("standardizes tasks into executable environments")
    expect(context.section).not.toContain("MIMIC-III 9,318")
    expect(context.section).not.toContain("CODING ENVIRONMENT")
  })
})
