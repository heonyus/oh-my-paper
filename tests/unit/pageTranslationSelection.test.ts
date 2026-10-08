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
