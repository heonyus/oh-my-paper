import { render } from "@testing-library/react"
import { type JSX, useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { usePageSourceHover } from "../../src/renderer/lib/usePageSourceHover"

type PaneBlocks = Parameters<typeof usePageSourceHover>[2]

function Pane({
  page,
  blocks,
}: {
  readonly page: number
  readonly blocks?: PaneBlocks
}): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  usePageSourceHover(page, bodyRef, blocks)
  return (
    <div ref={bodyRef} className="page-translation-body">
      <article data-block-ids="p3-b1">첫 문장 번역</article>
      <article data-block-ids="p3-b2 p3-b3">둘째 문단 번역</article>
    </div>
  )
}

function pdfPage(): { readonly first: HTMLElement; readonly second: HTMLElement } {
  const page = document.createElement("div")
  page.className = "page"
  page.setAttribute("data-page-number", "3")
  page.innerHTML = `<div class="textLayer">
      <span data-page-translation-block="p3-b1">The study included all patients</span>
      <span data-page-translation-block="p3-b1,p3-b2">admitted to the ICU.</span>
      <span data-page-translation-block="p3-b3">Patients without data</span>
    </div>`
  document.body.append(page)
  const [first, , second] = page.querySelectorAll<HTMLElement>("span")
  if (!first || !second) throw new Error("spans missing")
  return { first, second }
}

function hover(target: Element): void {
  target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }))
}

describe("hovering English source text", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("highlights the matching translation and only the sentence pointed at", () => {
    const { first, second } = pdfPage()
    const { container } = render(<Pane page={3} />)
    const [translationOne, translationTwo] = container.querySelectorAll("article")

    hover(second)

    expect(translationTwo).toHaveAttribute("data-source-hover", "true")
    expect(translationOne).not.toHaveAttribute("data-source-hover")
    // The paragraph's other sentence, p3-b2, stays unlit.
    expect(second).toHaveAttribute("data-page-translation-active", "true")
    expect(document.querySelectorAll('[data-page-translation-active="true"]')).toHaveLength(1)

    hover(first)

    expect(translationOne).toHaveAttribute("data-source-hover", "true")
    expect(translationTwo).not.toHaveAttribute("data-source-hover")
    expect(second).not.toHaveAttribute("data-page-translation-active")
  })

  it("moves the light from sentence to sentence within one translated paragraph", () => {
    const { second } = pdfPage()
    const shared = document.querySelectorAll<HTMLElement>(".textLayer span")[1]
    if (!shared) throw new Error("spans missing")
    const { container } = render(<Pane page={3} />)
    const translationTwo = container.querySelectorAll("article")[1]

    hover(second)
    expect(second).toHaveAttribute("data-page-translation-active", "true")

    // The pointer is on the line that sentence p3-b2 shares with the paragraph before.
    shared.setAttribute("data-page-translation-block", "p3-b2")
    hover(shared)

    expect(translationTwo).toHaveAttribute("data-source-hover", "true")
    expect(shared).toHaveAttribute("data-page-translation-active", "true")
    expect(second).not.toHaveAttribute("data-page-translation-active")
  })

  it("pairs a translated sentence with its source when the pointer is on the translation", () => {
    const lit = new Map<string, { readonly ranges: readonly Range[] }>()
    vi.stubGlobal(
      "Highlight",
      class {
        readonly ranges: readonly Range[]
        constructor(...ranges: Range[]) {
          this.ranges = ranges
        }
      },
    )
    vi.stubGlobal("CSS", { highlights: lit })
    const { second } = pdfPage()
    const shared = document.querySelectorAll<HTMLElement>(".textLayer span")[1]
    const { container } = render(
      <Pane
        page={3}
        blocks={[
          { id: "p3-b2", source: "admitted to the ICU.", translation: "둘째 문단" },
          { id: "p3-b3", source: "Patients without data", translation: "번역" },
        ]}
      />,
    )
    const translationTwo = container.querySelectorAll("article")[1]
    const text = translationTwo?.firstChild
    if (!shared || !translationTwo || !text) throw new Error("pane missing")
    // The browser says the pointer is on the last word, which is sentence p3-b3's.
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({ offsetNode: text, offset: 7 }),
    })
    try {
      hover(translationTwo)

      expect(second).toHaveAttribute("data-page-translation-active", "true")
      expect(shared).not.toHaveAttribute("data-page-translation-active")
      expect(translationTwo).toHaveAttribute("data-sentence-hover")
      expect(lit.get("page-translation-source")?.ranges.map(String)).toEqual(["번역"])

      hover(document.body)
      expect(translationTwo).not.toHaveAttribute("data-sentence-hover")
      expect(lit.has("page-translation-source")).toBe(false)
    } finally {
      Reflect.deleteProperty(document, "caretPositionFromPoint")
    }
  })

  it("clears the highlight when the pointer leaves the page text", () => {
    const { first } = pdfPage()
    const { container } = render(<Pane page={3} />)

    hover(first)
    hover(document.body)

    expect(container.querySelector("[data-source-hover]")).toBeNull()
    expect(first).not.toHaveAttribute("data-page-translation-active")
  })

  it("ignores text on other pages", () => {
    const { first } = pdfPage()
    const { container } = render(<Pane page={4} />)

    hover(first)

    expect(container.querySelector("[data-source-hover]")).toBeNull()
  })

  it("scrolls only the translation body once the pointer rests on a block", () => {
    vi.stubGlobal("innerHeight", 1_000)
    vi.useFakeTimers()
    const { second } = pdfPage()
    const { container } = render(<Pane page={3} />)
    const body = container.querySelector<HTMLElement>(".page-translation-body")
    const target = container.querySelectorAll<HTMLElement>("article")[1]
    if (!body || !target) throw new Error("pane missing")
    const scrollBy = vi.fn()
    body.scrollBy = scrollBy
    Object.defineProperty(body, "offsetHeight", { value: 200 })
    body.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 100, width: 300, height: 200 })
    target.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 500, width: 300, height: 40 })

    hover(second)
    expect(scrollBy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)

    // Centres the 40px block in the 200px body: 500 - (100 + 80).
    expect(scrollBy).toHaveBeenCalledWith({ top: 320, behavior: "smooth" })
  })

  it("treats the part of a tall pane below the window as hidden", () => {
    vi.useFakeTimers()
    vi.stubGlobal("innerHeight", 600)
    const { second } = pdfPage()
    const { container } = render(<Pane page={3} />)
    const body = container.querySelector<HTMLElement>(".page-translation-body")
    const target = container.querySelectorAll<HTMLElement>("article")[1]
    if (!body || !target) throw new Error("pane missing")
    const scrollBy = vi.fn()
    body.scrollBy = scrollBy
    Object.defineProperty(body, "offsetHeight", { value: 1_000 })
    body.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 200, width: 300, height: 1_000 })
    target.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 0, y: 1_100, width: 300, height: 80 })

    hover(second)
    vi.advanceTimersByTime(300)

    // Visible part is 200-600, so the block moves to 360: 1100 - 360.
    expect(scrollBy).toHaveBeenCalledWith({ top: 740, behavior: "smooth" })
  })
})
