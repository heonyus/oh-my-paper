import { afterEach, describe, expect, it, vi } from "vitest"
import {
  bindPageTranslationSpans,
  sourceBlockIdsAtPoint,
  sourceTextIsExact,
  sourceTextRange,
} from "../../src/renderer/lib/pageTranslationSpanMapping"

const box = { x: 0, y: 0, width: 1_000, height: 1_000 }

function block(id: string, source: string) {
  return { id, source, sourceBounds: box, sourcePageWidth: 1_000, sourcePageHeight: 1_000 }
}

/** A page whose text layer holds one span per given line. */
function pageOf(...lines: readonly string[]): readonly HTMLSpanElement[] {
  const page = document.createElement("div")
  page.className = "page"
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1_000, 1_000))
  const textLayer = document.createElement("div")
  textLayer.className = "textLayer"
  const spans = lines.map((line, index) => {
    const span = document.createElement("span")
    span.textContent = line
    vi.spyOn(span, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100 + index * 20, 600, 14),
    )
    return span
  })
  textLayer.append(...spans)
  page.append(textLayer)
  document.body.append(page)
  return spans
}

function bind(spans: readonly HTMLSpanElement[], ...blocks: ReturnType<typeof block>[]): void {
  bindPageTranslationSpans(spans[0]?.closest<HTMLElement>(".page") ?? null, blocks)
}

/** Stands in for the browser saying which character of `span` the pointer is over. */
function pointAt(span: HTMLElement, offset: number): void {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: span.firstChild, offset }),
  })
}

describe("page translation span mapping", () => {
  afterEach(() => {
    document.body.replaceChildren()
    Reflect.deleteProperty(document, "caretPositionFromPoint")
  })

  it("marks out each sentence's own text on a line two sentences share", () => {
    const [first, second] = pageOf(
      "we assume (as usual). Node classification is",
      "perhaps the most popular task.",
    )
    if (!first || !second) throw new Error("spans missing")
    bind(
      [first, second],
      block("s1", "we assume (as usual)."),
      block("s2", "Node classification is perhaps the most popular task."),
    )

    expect(first).toHaveAttribute("data-page-translation-block", "s1,s2")
    expect(sourceTextIsExact(first)).toBe(true)
    // With the punctuation that closes the sentence, though only letters are compared.
    expect(sourceTextRange(first, "s1")?.toString()).toBe("we assume (as usual).")
    expect(sourceTextRange(first, "s2")?.toString()).toBe("Node classification is")
    expect(sourceTextRange(second, "s2")?.toString()).toBe("perhaps the most popular task.")
    expect(sourceTextRange(second, "s1")).toBeNull()
  })

  it("names the sentence under the pointer, and the nearer one in the gap between two", () => {
    const [line] = pageOf("ends here. Starts there")
    if (!line) throw new Error("span missing")
    bind([line], block("s1", "ends here."), block("s2", "Starts there"))

    pointAt(line, 3)
    expect(sourceBlockIdsAtPoint(line, { x: 0, y: 0 })).toEqual(["s1"])
    pointAt(line, 15)
    expect(sourceBlockIdsAtPoint(line, { x: 0, y: 0 })).toEqual(["s2"])
    pointAt(line, 10)
    expect(sourceBlockIdsAtPoint(line, { x: 0, y: 0 })).toEqual(["s1"])
  })

  it("names every sentence of the span when the pointer cannot be placed in its text", () => {
    const [line] = pageOf("ends here. Starts there")
    if (!line) throw new Error("span missing")
    bind([line], block("s1", "ends here."), block("s2", "Starts there"))

    expect(sourceBlockIdsAtPoint(line, { x: 0, y: 0 })).toEqual(["s1", "s2"])
  })

  it("keeps the place of text set with ligatures and accents", () => {
    const [line] = pageOf("the ﬁrst café. Next one")
    if (!line) throw new Error("span missing")
    bind([line], block("s1", "the first café."), block("s2", "Next one"))

    expect(sourceTextRange(line, "s1")?.toString()).toBe("the ﬁrst café.")
    expect(sourceTextRange(line, "s2")?.toString()).toBe("Next one")
  })
})
