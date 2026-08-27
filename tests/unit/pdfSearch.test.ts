import { afterEach, describe, expect, it } from "vitest"
import { findPdfTextPage, paperContextForQuestion } from "../../src/renderer/lib/pdfSearch"

function addPage(pageNumber: number, text: string): void {
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", String(pageNumber))
  const layer = document.createElement("div")
  layer.className = "textLayer"
  const span = document.createElement("span")
  span.textContent = text
  layer.append(span)
  page.append(layer)
  document.body.append(page)
}

describe("PDF search context", () => {
  afterEach(() =>
    document.querySelectorAll(".page").forEach((page) => {
      page.remove()
    }),
  )

  it("finds a page and ranks relevant paper context", () => {
    addPage(1, "Introduction to clinical agents")
    addPage(2, "Retrospective memory retrieval preserves long context")

    expect(findPdfTextPage("memory retrieval")).toBe(2)
    expect(paperContextForQuestion("How does memory retrieval work?", 1)).toMatch(
      /^Page 2: Retrospective memory retrieval/u,
    )
  })
})
