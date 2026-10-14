import { describe, expect, it } from "vitest"
import { exampleSentence } from "../../src/renderer/lib/vocabularyExample"
import { type SourceDocumentAst, sourceDocumentAstSchema } from "../../src/shared/documentAst"
import { type SourceAnchor, sourceAnchorSchema } from "../../src/shared/schemas"

type Line = { readonly text: string; readonly width?: number; readonly height?: number }

/** A one-page structure with one item per line, the lines one space apart in the page text. */
function pageOf(lines: readonly Line[]): SourceDocumentAst {
  let offset = 0
  const items = lines.map((line, index) => {
    const item = {
      id: `item:${index}`,
      pageId: "page:3",
      text: line.text,
      normalizedStart: offset,
      normalizedEnd: offset + line.text.length,
      bounds: { x: 40, y: 40 + index * 14, width: line.width ?? 480, height: line.height ?? 10 },
    }
    offset += line.text.length + 1
    return item
  })
  return sourceDocumentAstSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash: "a".repeat(64),
    extractorVersion: "test",
    pages: [{ id: "page:3", page: 3, width: 600, height: 800 }],
    items,
    lines: items.map((item, index) => ({
      id: `line:${index}`,
      pageId: "page:3",
      sourceItemIds: [item.id],
      bounds: item.bounds,
    })),
  })
}

/** The anchor of `quote` in line `index`, with its structure range as the reader stores it. */
function anchorAt(ast: SourceDocumentAst, index: number, quote: string): SourceAnchor {
  const item = ast.items[index]
  if (!item) throw new Error("no such line")
  const start = item.normalizedStart + item.text.indexOf(quote)
  return sourceAnchorSchema.parse({
    page: 3,
    quote,
    x: 0,
    y: 0,
    fragments: [],
    astRanges: [{ sourceItemId: item.id, start, end: start + quote.length }],
  })
}

function marked(ast: SourceDocumentAst, anchor: SourceAnchor): string | null {
  const found = exampleSentence(ast, anchor)
  if (!found) return null
  const { text, wordStart, wordEnd } = found
  return `${text.slice(0, wordStart)}[${text.slice(wordStart, wordEnd)}]${text.slice(wordEnd)}`
}

describe("exampleSentence", () => {
  it("finds the sentence the word sits in, leaving the heading above and the next sentence out", () => {
    const ast = pageOf([
      { text: "Results", width: 60 },
      { text: "Lactate rose before the event. This indicates that perfusion was" },
      { text: "failing early. Later values were normal." },
    ])
    expect(marked(ast, anchorAt(ast, 1, "indicates"))).toBe(
      "This [indicates] that perfusion was failing early.",
    )
  })

  it("keeps a heading set in larger type out of the sentence below it", () => {
    const ast = pageOf([
      { text: "1. Introduction and Motivation", width: 300, height: 14 },
      { text: "Scientific inquiry demands seamless cross-referencing between hypotheses." },
    ])
    expect(marked(ast, anchorAt(ast, 1, "seamless"))).toBe(
      "Scientific inquiry demands [seamless] cross-referencing between hypotheses.",
    )
  })

  it("joins a word broken across lines again", () => {
    const ast = pageOf([
      { text: "Monitoring was intermit-" },
      { text: "tent in the first hours of the stay." },
    ])
    expect(marked(ast, anchorAt(ast, 1, "first"))).toBe(
      "Monitoring was intermittent in the [first] hours of the stay.",
    )
  })

  it("finds the word by its quote when the anchor has no structure range", () => {
    const ast = pageOf([{ text: "Sepsis was rare. Shock was common in this cohort." }])
    const anchor = sourceAnchorSchema.parse({ page: 3, quote: "cohort", x: 0, y: 0, fragments: [] })
    expect(marked(ast, anchor)).toBe("Shock was common in this [cohort].")
  })

  it("cuts a run-on sentence to a window around the word", () => {
    const filler = Array.from({ length: 60 }, (_, index) => `term${index}`).join(" ")
    const ast = pageOf([{ text: `${filler} pivotal ${filler} end.` }])
    const found = exampleSentence(ast, anchorAt(ast, 0, "pivotal"))
    expect(found?.text.startsWith("…")).toBe(true)
    expect(found?.text.endsWith("…")).toBe(true)
    expect(found && found.text.slice(found.wordStart, found.wordEnd)).toBe("pivotal")
    expect(found?.text.length).toBeLessThan(400)
  })

  it("gives nothing for a word that is not on the page", () => {
    const ast = pageOf([{ text: "Nothing to see here." }])
    const anchor = sourceAnchorSchema.parse({ page: 3, quote: "absent", x: 0, y: 0, fragments: [] })
    expect(exampleSentence(ast, anchor)).toBeNull()
  })
})
