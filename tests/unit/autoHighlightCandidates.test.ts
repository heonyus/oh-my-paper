import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  autoHighlightSourceEvidence,
  collectAutoHighlightCandidates,
  normalizedTextIndex,
} from "../../src/renderer/lib/autoHighlightCandidates"

function addPage(pageNumber: number, lines: readonly string[]): HTMLElement {
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", String(pageNumber))
  const textLayer = document.createElement("div")
  textLayer.className = "textLayer"
  for (const line of lines) {
    const span = document.createElement("span")
    span.textContent = line
    textLayer.append(span)
  }
  page.append(textLayer)
  document.body.append(page)
  return page
}

describe("auto highlight candidate extraction", () => {
  it("inserts visual word boundaries while preserving range positions", () => {
    const textLayer = document.createElement("div")
    const first = document.createElement("span")
    first.textContent = "best"
    const second = document.createElement("span")
    second.textContent = "performing"
    textLayer.append(first, second)

    const indexed = normalizedTextIndex(textLayer)

    expect(indexed.text).toBe("best performing")
    expect(indexed.positions[indexed.text.indexOf("performing")]?.node).toBe(second.firstChild)
  })

  it("filters author metadata, references, and numeric table rows while keeping later contributions", () => {
    addPage(1, [
      "Jane Doe jane@example.com Department of Computing",
      "Abstract We present a robust method that improves evidence retrieval.",
      "[5] Smith, J. 2020. A paper title.",
      "base 6 512 2048 8 64 64 0.1 65",
    ])
    addPage(2, [
      "We propose a reusable evidence index for clinical documents and show improved results.",
    ])

    const candidates = collectAutoHighlightCandidates()
    const quotes = candidates.map((candidate) => candidate.quote)

    expect(quotes.some((quote) => quote.includes("jane@example.com"))).toBe(false)
    expect(quotes.some((quote) => quote.startsWith("[5]"))).toBe(false)
    expect(quotes.some((quote) => quote.startsWith("base 6"))).toBe(false)
    expect(quotes.some((quote) => quote.includes("We propose a reusable evidence index"))).toBe(
      true,
    )
  })

  it("keeps serialized source evidence within the AI request boundary", () => {
    document.body.innerHTML = ""
    addPage(
      1,
      Array.from(
        { length: 60 },
        (_, index) =>
          `We propose contribution ${index} with a reusable evidence method that improves results across documents and supports careful review while preserving source locations, recording evaluation conditions, exposing limitations, and enabling reproducible research decisions across independent studies`,
      ),
    )

    const candidates = collectAutoHighlightCandidates(60)
    const evidence = autoHighlightSourceEvidence(candidates)
    const parsed = z.object({ candidates: z.array(z.unknown()) }).parse(JSON.parse(evidence))

    expect(evidence.length).toBeLessThanOrEqual(12_000)
    expect(parsed.candidates).toHaveLength(candidates.length)
    expect(candidates.length).toBeLessThan(60)
  })
})
