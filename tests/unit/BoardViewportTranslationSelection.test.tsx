import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { BoardViewport } from "../../src/renderer/components/BoardViewport"
import type { BoardViewportProps } from "../../src/renderer/components/BoardViewportProps"
import { announceTextLayerRendered } from "../../src/renderer/lib/pageRenderEvents"
import {
  clearPageTranslationBlocks,
  publishPageTranslationBlocks,
} from "../../src/renderer/lib/pageTranslationBlocksRegistry"
import type { BoardCard } from "../../src/renderer/types"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/components/PdfSurface", () => ({ PdfSurface: () => null }))
vi.mock("../../src/renderer/components/BoardNavigationController", () => ({
  BoardNavigationController: () => null,
}))

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

function renderBoard(cards: readonly BoardCard[] = []): {
  readonly onCardsChange: ReturnType<typeof vi.fn>
} {
  const onCardsChange = vi.fn()
  const props: BoardViewportProps = {
    document: documentRecordSchema.parse({
      id: "aabbccddeeff0011",
      name: "paper.pdf",
      hash: "a".repeat(64),
      bytes: 1024,
      importedAt: "2026-08-30T00:00:00.000Z",
      pageCount: 3,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      quality: { textCharacters: 100, needsOcr: false, warnings: [] },
    }),
    viewport: { x: 0, y: 0, zoom: 1 },
    cards,
    onViewportChange: vi.fn(),
    onCardsChange,
    onCardsPreview: vi.fn(),
    onDocumentLoaded: vi.fn(),
    onPageActive: vi.fn(),
    currentPage: 1,
    onAiRequest: vi.fn(async () => ""),
    tool: "select",
    minimapVisible: false,
    onMinimapVisibleChange: vi.fn(),
  }
  const { container } = render(<BoardViewport {...props} />)
  const world = container.querySelector<HTMLElement>(".board-world")
  if (!world) throw new Error("board world missing")
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
    <span data-page-translation-block="p1-b2">Critically ill patients are cared for in ICUs.</span>
  </div>`
  const spans = [...page.querySelectorAll<HTMLElement>(".textLayer span")]
  for (const [index, span] of spans.entries())
    setBox(span, { left: 340, top: 120 + index * 14, width: 300, height: 12 })
  const pane = document.createElement("section")
  pane.className = "page-translation-pane"
  pane.setAttribute("data-page-number", "1")
  pane.innerHTML = `<article data-block-ids="p1-b1"><div class="page-translation-result"><p>중증 질환은 장기 기능 부전으로 특징지어진다.</p></div></article>
    <article data-block-ids="p1-b2"><div class="page-translation-result"><p>중증 환자는 중환자실에서 치료받는다.</p></div></article>`
  const results = [...pane.querySelectorAll<HTMLElement>(".page-translation-result p")]
  for (const [index, result] of results.entries())
    setBox(result, { left: 916, top: 80 + index * 60, width: 320, height: 48 })
  world.append(page, pane)
  publishPageTranslationBlocks(1, [
    {
      id: "p1-b1",
      kind: "body",
      source: "Critical illness is characterized by organ dysfunction.",
      translation: "중증 질환은 장기 기능 부전으로 특징지어진다.",
    },
    {
      id: "p1-b2",
      kind: "body",
      source: "Critically ill patients are cared for in ICUs.",
      translation: "중증 환자는 중환자실에서 치료받는다.",
    },
  ])
  return { onCardsChange }
}

function selectTranslation(): void {
  const text = document.querySelectorAll(".page-translation-result p")[1]?.firstChild
  if (!text) throw new Error("fixture")
  const range = document.createRange()
  range.setStart(text, 3)
  range.setEnd(text, 12)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  act(() => {
    document.dispatchEvent(new Event("selectionchange"))
  })
}

describe("selecting text in a page's translation pane", () => {
  afterEach(() => {
    clearPageTranslationBlocks(1)
    window.getSelection()?.removeAllRanges()
    document.body.innerHTML = ""
  })

  it("offers every selection action but translate, and highlights the source sentence", () => {
    const { onCardsChange } = renderBoard()
    selectTranslation()

    const toolbar = screen.getByRole("toolbar", { name: "선택 작업" })
    expect(toolbar).toHaveStyle({ left: "916px", top: "96px" })
    expect(screen.queryByRole("button", { name: "번역" })).toBeNull()
    expect(screen.getByRole("button", { name: "설명" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "하이라이트" }))

    const cards: readonly BoardCard[] = onCardsChange.mock.calls[0]?.[0] ?? []
    expect(cards).toHaveLength(1)
    expect(cards[0]?.kind).toBe("highlight")
    expect(cards[0]?.anchor.page).toBe(1)
    expect(cards[0]?.anchor.quote).toBe("Critically ill patients are cared for in ICUs.")
    expect(cards[0]?.anchor.fragments).toEqual([{ x: 340, y: 134, width: 300, height: 12 }])
    expect(cards[0]?.body).toBe("Critically ill patients are cared for in ICUs.")
  })

  it("ignores the translate shortcut, which has nothing left to translate", () => {
    const { onCardsChange } = renderBoard()
    selectTranslation()

    fireEvent.keyDown(document, { key: "t", code: "KeyT" })
    expect(onCardsChange).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: "h", code: "KeyH" })
    expect(onCardsChange).toHaveBeenCalledTimes(1)
  })
})

describe("highlights saved as blocks", () => {
  afterEach(() => {
    clearPageTranslationBlocks(1)
    document.body.innerHTML = ""
  })

  it("are redrawn on their quote's lines once the page's text layer is laid out", async () => {
    const block = boardCardSchema.parse({
      id: "2889c232-6a05-46df-bd89-9f128b49ad42",
      documentId: "aabbccddeeff0011",
      kind: "highlight",
      title: "하이라이트",
      body: "Critically ill patients are cared for in ICUs.",
      x: 900,
      y: 240,
      minimized: false,
      anchor: {
        page: 1,
        quote: "Critically ill patients are cared for in ICUs.",
        x: 640,
        y: 140,
        fragments: [{ x: 330, y: 110, width: 330, height: 60 }],
      },
    })
    const { onCardsChange } = renderBoard([block])
    act(() => {
      announceTextLayerRendered(1)
    })
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

    const cards: readonly BoardCard[] = onCardsChange.mock.calls.at(-1)?.[0] ?? []
    expect(cards[0]?.anchor.fragments).toEqual([{ x: 340, y: 134, width: 300, height: 12 }])
  })
})
