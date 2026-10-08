import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { tightenedHighlight, tightenedHighlights } from "../../src/renderer/lib/highlightTightening"
import { boardCardSchema } from "../../src/shared/schemas"

type Box = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function setBox(element: Element, box: Box): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height }),
  })
}

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

function fixture(): { readonly world: HTMLElement; readonly page: HTMLElement } {
  const world = document.createElement("div")
  world.className = "board-world"
  Object.defineProperties(world, { offsetWidth: { value: 4_800 }, offsetHeight: { value: 6_400 } })
  setBox(world, { left: 0, top: 0, width: 4_800, height: 6_400 })
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", "12")
  setBox(page, { left: 300, top: 64, width: 600, height: 800 })
  const lines = [
    "Labeling of future circulatory failure. All time points annotated as",
    "no circulatory failure were labeled as positive if circulatory",
    "failure occurs in the next 8 h, otherwise negative (Fig. 1e).",
    "Patient-centered adaptive time series imputation. Our strategy",
  ]
  page.innerHTML = `<div class="textLayer">${lines.map((line) => `<span>${line}</span>`).join("")}</div>`
  for (const [index, span] of page.querySelectorAll<HTMLElement>("span").entries())
    setBox(span, { left: 340, top: 120 + index * 14, width: 300, height: 12 })
  world.append(page)
  document.body.append(world)
  return { world, page }
}

const blockHighlight = boardCardSchema.parse({
  id: "2889c232-6a05-46df-bd89-9f128b49ad42",
  documentId: "aabbccddeeff0011",
  kind: "highlight",
  title: "하이라이트",
  body: "Labeling of future circulatory failure.",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 12,
    quote:
      "Labeling of future circulatory failure. All time points annotated as $no$ circulatory failure were labeled as positive if circulatory failure occurs in the next 8 h, otherwise negative (Fig. 1e).",
    x: 640,
    y: 140,
    // The paragraph's whole box, as the earlier fallback drew it.
    fragments: [{ x: 330, y: 110, width: 330, height: 70 }],
  },
})

describe("tightening block highlights", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("redraws a block highlight on the lines its quote is printed on", () => {
    const { world, page } = fixture()
    const tightened = tightenedHighlight(blockHighlight, page, world)
    expect(tightened?.anchor.fragments).toEqual([
      { x: 340, y: 120, width: 300, height: 12 },
      { x: 340, y: 134, width: 300, height: 12 },
      { x: 340, y: 148, width: 300, height: 12 },
    ])
    expect(tightened?.anchor.x).toBe(640)
    expect(tightened?.anchor.y).toBe(126)
  })

  it("leaves a highlight alone that is already its lines, or whose quote lies elsewhere", () => {
    const { world, page } = fixture()
    const exact = {
      ...blockHighlight,
      anchor: {
        ...blockHighlight.anchor,
        fragments: [
          { x: 340, y: 120, width: 300, height: 12 },
          { x: 340, y: 134, width: 300, height: 12 },
          { x: 340, y: 148, width: 300, height: 12 },
        ],
      },
    }
    expect(tightenedHighlight(exact, page, world)).toBeNull()
    const elsewhere = {
      ...blockHighlight,
      anchor: { ...blockHighlight.anchor, fragments: [{ x: 330, y: 400, width: 330, height: 70 }] },
    }
    expect(tightenedHighlight(elsewhere, page, world)).toBeNull()
    const unknown = {
      ...blockHighlight,
      anchor: {
        ...blockHighlight.anchor,
        quote: "Nothing like this is printed on the page at all.",
      },
    }
    expect(tightenedHighlight(unknown, page, world)).toBeNull()
  })

  it("returns the same array when no card on the page changes", () => {
    const { world, page } = fixture()
    const cards = [{ ...blockHighlight, anchor: { ...blockHighlight.anchor, page: 3 } }]
    expect(tightenedHighlights(cards, 12, page, world)).toBe(cards)
    expect(
      tightenedHighlights([blockHighlight], 12, page, world)[0]?.anchor.fragments,
    ).toHaveLength(3)
  })
})
