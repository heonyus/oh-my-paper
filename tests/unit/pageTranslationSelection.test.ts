import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  captureTranslationSelection,
  selectedTranslationBlocks,
} from "../../src/renderer/lib/pageTranslationSelection"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"

type Box = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function setBox(element: Element, box: Box): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () =>
      DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height }),
  })
}

// jsdom draws nothing: a range covers the boxes of the elements whose text it touches.
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function rects(this: Range): readonly DOMRect[] {
      const root = this.commonAncestorContainer
      const texts: Node[] = []
      if (root instanceof Text) texts.push(root)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node)
      const elements = new Set<Element>()
      for (const node of texts) {
        const parent = node.parentElement
        if (parent && this.intersectsNode(node)) elements.add(parent)
      }
      return [...elements].map((element) => element.getBoundingClientRect())
    },
  })
})

const blocks: readonly PageTranslationBlock[] = [
  {
    id: "p1-b1",
    kind: "body",
    source: "Critical illness is characterized by organ dysfunction.",
    translation: "중증 질환은 장기 기능 부전으로 특징지어진다.",
  },
  {
    id: "p1-b2",
    kind: "body",
    source: "Critically ill patients are cared for in ICUs ([1](https://example.org/1)).",
    translation: "중증 환자는 중환자실에서 치료받는다.",
  },
  {
    id: "p1-b3",
    kind: "body",
    source: "Circulatory failure is common.",
    translation: "순환 부전은 흔하다.",
  },
]

function fixture(): {
  readonly world: HTMLElement
  readonly page: HTMLElement
  readonly pane: HTMLElement
  readonly results: readonly HTMLElement[]
} {
  const world = document.createElement("div")
  world.className = "board-world"
  Object.defineProperties(world, {
    offsetWidth: { value: 4_800 },
    offsetHeight: { value: 6_400 },
  })
  setBox(world, { left: 0, top: 0, width: 4_800, height: 6_400 })
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", "1")
  setBox(page, { left: 300, top: 64, width: 600, height: 800 })
  page.innerHTML = `<div class="textLayer">
    <span data-page-translation-block="p1-b1">Critical illness is characterized by organ dysfunction.</span>
    <span data-page-translation-block="p1-b2">Critically ill patients are cared for in ICUs (1).</span>
    <span data-page-translation-block="p1-b3">Circulatory failure is common.</span>
  </div>`
  const spans = [...page.querySelectorAll<HTMLElement>(".textLayer span")]
  for (const [index, span] of spans.entries())
    setBox(span, { left: 340, top: 120 + index * 14, width: 300 - index * 40, height: 12 })
  const pane = document.createElement("section")
  pane.className = "page-translation-pane"
  pane.setAttribute("data-page-number", "1")
  pane.innerHTML = `
    <article data-block-ids="p1-b1 p1-b2"><div class="page-translation-result"><p>중증 질환은 장기 기능 부전으로 특징지어진다. 중증 환자는 중환자실에서 치료받는다.</p></div></article>
    <article data-block-ids="p1-b3"><div class="page-translation-result"><p>순환 부전은 흔하다.</p></div></article>`
  const results = [...pane.querySelectorAll<HTMLElement>(".page-translation-result p")]
  for (const [index, result] of results.entries())
    setBox(result, { left: 916, top: 80 + index * 60, width: 320, height: 48 })
  world.append(page, pane)
  document.body.append(world)
  return { world, page, pane, results }
}

function rangeIn(node: Node, start: number, endNode: Node = node, end = start): Range {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(endNode, end)
  return range
}

describe("selecting in the translation pane", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("stands for the source sentence the selected words translate", () => {
    const { world, page, pane, results } = fixture()
    const text = results[0]?.firstChild
    if (!text) throw new Error("fixture")
    // "중증 환자는 중환자실" — part of the second sentence only.
    const range = rangeIn(text, 26, text, 37)
    expect(range.toString()).toBe("중증 환자는 중환자실")

    expect(selectedTranslationBlocks(pane, range, blocks).map((block) => block.id)).toEqual([
      "p1-b2",
    ])
    const selection = captureTranslationSelection({
      paneElement: pane,
      pageElement: page,
      boardWorldElement: world,
      range,
      blocks,
    })

    expect(selection?.page).toBe(1)
    expect(selection?.quote).toBe("Critically ill patients are cared for in ICUs (1).")
    expect(selection?.fragments).toEqual([{ x: 340, y: 134, width: 260, height: 12 }])
    expect(selection?.viaTranslation).toEqual({
      text: "중증 환자는 중환자실",
      anchor: { x: 916, y: 80, width: 320, height: 48 },
    })
  })

  it("spans the sentences a selection runs across, article to article", () => {
    const { world, page, pane, results } = fixture()
    const first = results[0]?.firstChild
    const second = results[1]?.firstChild
    if (!first || !second) throw new Error("fixture")
    const range = rangeIn(first, 30, second, 5)

    const selection = captureTranslationSelection({
      paneElement: pane,
      pageElement: page,
      boardWorldElement: world,
      range,
      blocks,
    })

    expect(selection?.quote).toBe(
      "Critically ill patients are cared for in ICUs (1). Circulatory failure is common.",
    )
    expect(selection?.fragments).toEqual([
      { x: 340, y: 134, width: 260, height: 12 },
      { x: 340, y: 148, width: 220, height: 12 },
    ])
  })

  it("finds the lines of a sentence no span was mapped to, not the box drawn for it", () => {
    const { world, page, pane, results } = fixture()
    // The imputation sentence: its formula reads differently in the text layer, so binding
    // mapped no span to it and drew its paragraph's box instead.
    const textLayer = page.querySelector(".textLayer")
    const lines = [
      "Patient-centered adaptive time series imputation. Values were",
      "imputed within (m",
      "i",
      ", iqr",
      "i",
      ") of the first measurement, as in",
      "Table 4. The rest of the paragraph follows for several more lines.",
    ]
    const spans = lines.map((text) => {
      const span = document.createElement("span")
      span.textContent = text
      textLayer?.append(span)
      return span
    })
    for (const [index, span] of spans.entries())
      setBox(span, {
        left: 340 + (index > 0 && index < 6 ? 60 * (index - 1) : 0),
        top: index === 0 ? 400 : index < 6 ? 414 : 428,
        width: index === 0 || index === 6 ? 300 : 60,
        height: 12,
      })
    const host = document.createElement("div")
    host.className = "paper-structure-host"
    host.innerHTML = `<div data-page-number="1"><div class="page-translation-source-bound" data-page-translation-block="p1-b4"></div></div>`
    const bound = host.querySelector(".page-translation-source-bound")
    if (!bound) throw new Error("fixture")
    setBox(bound, { left: 330, top: 390, width: 320, height: 60 })
    document.body.append(host)
    const formula: PageTranslationBlock = {
      id: "p1-b4",
      kind: "body",
      source:
        "Values were imputed within $(\\mathrm{m}_i, \\mathrm{iqr}_i)$ of the first measurement, as in Table 4.",
      translation: "값은 첫 측정값의 범위 안에서 보간했다.",
    }
    pane.insertAdjacentHTML(
      "beforeend",
      `<article data-block-ids="p1-b4"><div class="page-translation-result"><p>값은 첫 측정값의 범위 안에서 보간했다.</p></div></article>`,
    )
    const result = pane.querySelectorAll<HTMLElement>(".page-translation-result p")[2]
    const text = result?.firstChild
    if (!result || !text) throw new Error("fixture")
    setBox(result, { left: 916, top: 200, width: 320, height: 48 })

    const selection = captureTranslationSelection({
      paneElement: pane,
      pageElement: page,
      boardWorldElement: world,
      range: rangeIn(text, 0, text, 5),
      blocks: [...blocks, formula],
    })

    expect(selection?.quote).toBe(formula.source)
    // One rect per line from "Values were" to "Table 4", never the 60px-tall paragraph box.
    expect(selection?.fragments.map((fragment) => fragment.y)).toEqual([400, 414, 428])
    expect(selection?.fragments.every((fragment) => fragment.height === 12)).toBe(true)
    expect(results).toHaveLength(2)
  })

  it("is nothing when the pane holds no translation units yet", () => {
    const { world, page, pane, results } = fixture()
    const text = results[0]?.firstChild
    if (!text) throw new Error("fixture")
    expect(
      captureTranslationSelection({
        paneElement: pane,
        pageElement: page,
        boardWorldElement: world,
        range: rangeIn(text, 0, text, 5),
        blocks: [],
      }),
    ).toBeNull()
  })
})
