import { describe, expect, it, vi } from "vitest"
import {
  bindPageSourceBounds,
  clearPageSourceMapping,
  extractPageSourceBlocks,
  pageTranslationBatches,
  pageTranslationBlockIds,
  pageTranslationRequest,
  parsePageTranslationStream,
  setPageSourceActive,
} from "../../src/renderer/lib/pageTranslationSource"

function visibleSpan(
  text: string,
  size: number,
  weight: number,
  left = 0,
  top = 0,
): HTMLSpanElement {
  const span = document.createElement("span")
  span.textContent = text
  span.style.fontSize = `${size}px`
  span.style.fontWeight = String(weight)
  vi.spyOn(span, "getBoundingClientRect").mockReturnValue(
    new DOMRect(left, top, Math.max(20, text.length * 6), size + 2),
  )
  return span
}

describe("page translation source mapping", () => {
  it("maps every visible source sentence to a stable block id", () => {
    const page = document.createElement("div")
    page.className = "page"
    page.setAttribute("data-page-number", "1")
    const textLayer = document.createElement("div")
    textLayer.className = "textLayer"
    const first = visibleSpan("HealthFlow improves reliability.", 10, 400, 0, 0)
    const headingStart = visibleSpan("Resu", 15, 700, 0, 30)
    const headingEnd = visibleSpan("lts", 15, 700, 24, 30)
    const second = visibleSpan("It preserves every source sentence.", 10, 400, 0, 60)
    textLayer.append(first, headingStart, headingEnd, second)
    page.append(textLayer)
    document.body.append(page)

    const blocks = extractPageSourceBlocks(1)

    expect(blocks?.map((block) => block.source)).toEqual([
      "HealthFlow improves reliability.",
      "Results",
      "It preserves every source sentence.",
    ])
    expect(first).toHaveAttribute("data-page-translation-block", "p1-b1")
    expect(headingStart).toHaveAttribute("data-page-translation-block", "p1-b2")
    expect(headingEnd).toHaveAttribute("data-page-translation-block", "p1-b2")
    expect(second).toHaveAttribute("data-page-translation-block", "p1-b3")
    setPageSourceActive(1, "p1-b3", true)
    expect(second).toHaveAttribute("data-page-translation-active", "true")
    clearPageSourceMapping(1)
    expect(second).not.toHaveAttribute("data-page-translation-active")
    expect(second).not.toHaveAttribute("data-page-translation-block")
  })

  it("parses structured Markdown translations back onto the exact source ids", () => {
    const blocks = [
      { id: "p1-b1", kind: "heading", source: "Results" },
      { id: "p1-b2", kind: "body", source: "The score is $x=1$." },
    ] as const
    const request = pageTranslationRequest(blocks)
    const streamed = JSON.stringify({
      translations: [
        { id: "p1-b1", markdown: "## 결과" },
        { id: "p1-b2", markdown: "점수는 $x=1$이다." },
      ],
    })

    expect(JSON.parse(request)).toEqual({ blocks })
    expect([...parsePageTranslationStream(streamed)]).toEqual([
      ["p1-b1", "## 결과"],
      ["p1-b2", "점수는 $x=1$이다."],
    ])
  })

  it("parses AST source item IDs returned by page translation", () => {
    const streamed = JSON.stringify({
      translations: [{ id: "item:1.0", markdown: "번역된 첫 문장" }],
    })

    expect(pageTranslationBlockIds(streamed)).toEqual(["item:1.0"])
    expect([...parsePageTranslationStream(streamed)]).toEqual([["item:1.0", "번역된 첫 문장"]])
  })

  it("splits a normal academic page into bounded low-latency requests", () => {
    const blocks = Array.from({ length: 12 }, (_, index) => ({
      id: `page:1:block:${index}:sentence:1`,
      kind: "body" as const,
      source: "A representative academic sentence with terminology and citation context. ".repeat(
        6,
      ),
    }))

    const batches = pageTranslationBatches(blocks)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.every((batch) => pageTranslationRequest(batch).length <= 2_800)).toBe(true)
  })

  it("repairs LaTeX commands returned as JSON control characters", () => {
    const malformed =
      '{"translations":[{"id":"page:4:block:5:sentence:4","markdown":"파라미터 $	heta$와 모듈 $	ext{M}$"}]}'

    expect([...parsePageTranslationStream(malformed)]).toEqual([
      ["page:4:block:5:sentence:4", "파라미터 $\\theta$와 모듈 $\\text{M}$"],
    ])
    expect(pageTranslationBlockIds(malformed)).toEqual(["page:4:block:5:sentence:4"])
  })

  it("binds each Paddle sentence to only its matching PDF text lines", () => {
    const page = document.createElement("div")
    page.className = "page"
    page.setAttribute("data-page-number", "2")
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1_000, 1_000))
    const textLayer = document.createElement("div")
    textLayer.className = "textLayer"
    const first = visibleSpan("The first sentence.", 12, 400, 100, 200)
    const secondStart = visibleSpan("The second sentence spans", 12, 400, 100, 230)
    const secondEnd = visibleSpan("two lines.", 12, 400, 100, 250)
    const outside = visibleSpan("Figure text", 12, 400, 700, 200)
    textLayer.append(first, secondStart, secondEnd, outside)
    page.append(textLayer)
    const structureHost = document.createElement("div")
    structureHost.className = "paper-structure-host"
    const overlay = document.createElement("div")
    overlay.setAttribute("data-page-number", "2")
    structureHost.append(overlay)
    document.body.append(page, structureHost)

    bindPageSourceBounds(2, [
      {
        id: "page:2:block:3:sentence:1",
        kind: "body",
        source: "The first sentence.",
        sourceBounds: { x: 50, y: 150, width: 500, height: 200 },
        sourcePageWidth: 1_000,
        sourcePageHeight: 1_000,
      },
      {
        id: "page:2:block:3:sentence:2",
        kind: "body",
        source: "The second sentence spans two lines.",
        sourceBounds: { x: 50, y: 150, width: 500, height: 200 },
        sourcePageWidth: 1_000,
        sourcePageHeight: 1_000,
      },
    ])

    expect(first).toHaveAttribute("data-page-translation-block", "page:2:block:3:sentence:1")
    expect(secondStart).toHaveAttribute("data-page-translation-block", "page:2:block:3:sentence:2")
    expect(secondEnd).toHaveAttribute("data-page-translation-block", "page:2:block:3:sentence:2")
    expect(outside).not.toHaveAttribute("data-page-translation-block")
    expect(overlay.querySelector(".page-translation-source-bound")).toBeNull()
    document.body.replaceChildren()
  })
})
