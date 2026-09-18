import { describe, expect, it } from "vitest"
import { featureRequestContext, sectionRequestContext } from "../../src/renderer/lib/sectionContext"

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

  it("collects nearby section prose and caption while excluding labels inside a figure", () => {
    const page = makePage(2)
    addSpan(page, "4.2 RESULTS", { left: 80, top: 100, width: 180, height: 22 })
    addSpan(page, "The figure compares proprietary and open-source model performance.", {
      left: 80,
      top: 135,
      width: 560,
      height: 14,
    })
    addSpan(page, "Success Rate 0.8 0.6 0.4", {
      left: 180,
      top: 250,
      width: 240,
      height: 10,
    })
    addSpan(page, "Figure 1: Overall leaderboard evaluation in MedAgentGym.", {
      left: 100,
      top: 510,
      width: 540,
      height: 13,
    })
    addSpan(page, "The result supports the training environment's effectiveness.", {
      left: 80,
      top: 545,
      width: 560,
      height: 14,
    })
    addSpan(page, "5 TRAINING", { left: 80, top: 700, width: 180, height: 22 })

    const context = featureRequestContext(page, { x: 100, y: 180, width: 540, height: 310 })

    expect(context).toContain("4.2 RESULTS")
    expect(context).toContain("Overall leaderboard evaluation")
    expect(context).toContain("supports the training environment")
    expect(context).not.toContain("Success Rate 0.8")
    expect(context).not.toContain("5 TRAINING")
  })

  it("includes every numbered subsection until the next top-level section", () => {
    const viewer = document.createElement("div")
    const page3 = makePage(3)
    addSpan(page3, "3 METHOD", { left: 80, top: 100, width: 160, height: 22 })
    addSpan(page3, "The method builds an executable training environment.", {
      left: 80,
      top: 140,
      width: 520,
      height: 14,
    })
    addSpan(page3, "3.1 PROBLEM FORMULATION", {
      left: 80,
      top: 250,
      width: 260,
      height: 20,
    })
    addSpan(page3, "Tasks map a problem to executable code and verified output.", {
      left: 80,
      top: 285,
      width: 540,
      height: 14,
    })
    const page4 = makePage(4)
    addSpan(page4, "3.2 DATA CONSTRUCTION", {
      left: 80,
      top: 100,
      width: 240,
      height: 20,
    })
    addSpan(page4, "Datasets are standardized into a unified benchmark.", {
      left: 80,
      top: 135,
      width: 520,
      height: 14,
    })
    addSpan(page4, "4 EVALUATION", { left: 80, top: 500, width: 180, height: 22 })
    addSpan(page4, "This text belongs to the next top-level section.", {
      left: 80,
      top: 535,
      width: 500,
      height: 14,
    })
    viewer.append(page3, page4)

    const context = sectionRequestContext({
      viewer,
      page: page3,
      heading: "3 METHOD",
      bounds: { x: 80, y: 100, width: 160, height: 22 },
      paperTitle: "Paper",
    })

    expect(context.section).toContain("3.1 PROBLEM FORMULATION")
    expect(context.section).toContain("3.2 DATA CONSTRUCTION")
    expect(context.section).toContain("unified benchmark")
    expect(context.section).not.toContain("next top-level section")
  })

  it("includes nested children but stops at the next sibling subsection", () => {
    const viewer = document.createElement("div")
    const page = makePage(3)
    addSpan(page, "3.1 PROBLEM FORMULATION", {
      left: 80,
      top: 100,
      width: 260,
      height: 20,
    })
    addSpan(page, "The subsection defines the executable reasoning objective.", {
      left: 80,
      top: 135,
      width: 540,
      height: 14,
    })
    addSpan(page, "3.1.1 VERIFIER", { left: 80, top: 250, width: 180, height: 18 })
    addSpan(page, "The verifier checks generated outputs.", {
      left: 80,
      top: 280,
      width: 420,
      height: 14,
    })
    addSpan(page, "3.2 DATA CONSTRUCTION", {
      left: 80,
      top: 500,
      width: 240,
      height: 20,
    })
    addSpan(page, "Sibling content must not leak into 3.1.", {
      left: 80,
      top: 535,
      width: 440,
      height: 14,
    })
    viewer.append(page)

    const context = sectionRequestContext({
      viewer,
      page,
      heading: "3.1 PROBLEM FORMULATION",
      bounds: { x: 80, y: 100, width: 260, height: 20 },
      paperTitle: "Paper",
    })

    expect(context.section).toContain("3.1.1 VERIFIER")
    expect(context.section).toContain("checks generated outputs")
    expect(context.section).not.toContain("Sibling content")
  })

  it("keeps every action when an unnumbered run-in section ends near the page footer", () => {
    const viewer = document.createElement("div")
    const page = makePage(5)
    addSpan(page, "Agent Scaffolds.", { left: 80, top: 800, width: 140, height: 16 })
    addSpan(page, "Following CodeAct, interactions are modeled as a POMDP.", {
      left: 230,
      top: 800,
      width: 490,
      height: 16,
    })
    addSpan(page, "(a) request_info retrieves EHR data;", {
      left: 80,
      top: 835,
      width: 320,
      height: 16,
    })
    addSpan(page, "(b) terminal manages dependencies;", {
      left: 80,
      top: 870,
      width: 320,
      height: 16,
    })
    addSpan(page, "(c) code_execution runs generated code;", {
      left: 80,
      top: 920,
      width: 360,
      height: 16,
    })
    addSpan(page, "(d) debugging translates execution errors for LLM comprehension.", {
      left: 80,
      top: 955,
      width: 560,
      height: 16,
    })
    addSpan(page, "5", { left: 395, top: 985, width: 10, height: 12 })
    const next = makePage(6)
    addSpan(next, "Tasks and Datasets.", { left: 80, top: 100, width: 180, height: 16 })
    addSpan(next, "This belongs to the following experiment setup paragraph.", {
      left: 270,
      top: 100,
      width: 440,
      height: 16,
    })
    viewer.append(page, next)

    const context = sectionRequestContext({
      viewer,
      page,
      heading: "Agent Scaffolds.",
      bounds: { x: 80, y: 800, width: 140, height: 16 },
      paperTitle: "MedAgentGym",
    })

    expect(context.section).toContain("request_info")
    expect(context.section).toContain("terminal")
    expect(context.section).toContain("code_execution")
    expect(context.section).toContain("debugging translates execution errors")
    expect(context.section).not.toContain("following experiment setup")
  })
})
