import type { SourceDocumentAst } from "../../shared/documentAst"
import type { SourceAnchor } from "../../shared/schemas"

/** The sentence a word was met in, with where the word sits in it. */
export type ExampleSentence = {
  readonly text: string
  readonly wordStart: number
  readonly wordEnd: number
}

/** Longer sentences are cut around the word, so a run-on extraction still reads as one example. */
const MAX_SENTENCE = 360
const WINDOW = 160

/** A line this much narrower than the page's usual line is a heading, a running header or a paragraph's last line. */
const SHORT_LINE = 0.6
/** A line set this much taller than the page's usual line is a heading or a title. */
const TALL_LINE = 1.15

/** The middle value; of an even count, the larger middle one, or the smaller with `lower`. */
function median(values: readonly number[], lower = false): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length - (lower ? 1 : 0)) / 2)] ?? 0
}

/**
 * The page's text with the same offsets as the structure's normalized offsets. The gap after a
 * short line, and around a tall one, becomes a line break, so a heading or running header beside
 * a sentence is not read into it.
 */
/** Page texts already laid out, per structure, since a paper's words often share a page. */
const laidOut = new WeakMap<SourceDocumentAst, Map<number, string>>()

function pageText(ast: SourceDocumentAst, page: number): string {
  const pages = laidOut.get(ast) ?? new Map<number, string>()
  laidOut.set(ast, pages)
  const known = pages.get(page)
  if (known !== undefined) return known
  const text = layOutPage(ast, page)
  pages.set(page, text)
  return text
}

function layOutPage(ast: SourceDocumentAst, page: number): string {
  const pageId = `page:${page}`
  const items = ast.items
    .filter((item) => item.pageId === pageId)
    .sort((left, right) => left.normalizedStart - right.normalizedStart)
  const chars: string[] = []
  for (const item of items) {
    while (chars.length < item.normalizedStart) chars.push(" ")
    chars.splice(item.normalizedStart, item.text.length, ...item.text)
  }
  const spans = new Map(items.map((item) => [item.id, item]))
  const lines = ast.lines.filter((line) => line.pageId === pageId)
  const width = median(lines.map((line) => line.bounds.width))
  // Body text is the page's widest and its smallest type, so a page of few lines still finds it.
  const height = median(
    lines.map((line) => line.bounds.height),
    true,
  )
  const breakAt = (index: number): void => {
    if (chars[index] === " ") chars[index] = "\n"
  }
  for (const line of lines) {
    const lineItems = line.sourceItemIds.flatMap((id) => spans.get(id) ?? [])
    if (lineItems.length === 0) continue
    const tall = height > 0 && line.bounds.height > height * TALL_LINE
    const short = width > 0 && line.bounds.width < width * SHORT_LINE
    if (tall) breakAt(Math.min(...lineItems.map((item) => item.normalizedStart)) - 1)
    if (tall || short) breakAt(Math.max(...lineItems.map((item) => item.normalizedEnd)))
  }
  return chars.join("")
}

/** Where the anchor's word sits in the page text: its structure ranges, else its first match. */
function wordRange(
  ast: SourceDocumentAst,
  anchor: SourceAnchor,
  text: string,
): readonly [number, number] | null {
  const pageItems = new Set<string>(
    ast.items.filter((item) => item.pageId === `page:${anchor.page}`).map((item) => item.id),
  )
  const ranges = (anchor.astRanges ?? []).filter((range) => pageItems.has(range.sourceItemId))
  if (ranges.length > 0)
    return [
      Math.min(...ranges.map((range) => range.start)),
      Math.max(...ranges.map((range) => range.end)),
    ]
  const quote = anchor.quote.trim()
  const start = quote ? text.indexOf(quote) : -1
  return start < 0 ? null : [start, start + quote.length]
}

/**
 * The span with its whitespace collapsed and words broken across a line joined again
 * (`learn- ing` → `learning`), keeping the word's offsets in step.
 */
function tidy(span: string, wordStart: number, wordEnd: number): ExampleSentence {
  let text = ""
  let start = 0
  let end = 0
  for (let index = 0; index < span.length; index += 1) {
    if (index === wordStart) start = text.length
    if (index === wordEnd) end = text.length
    const char = span[index] ?? ""
    if (/\s/u.test(char)) {
      if (text.length > 0 && !text.endsWith(" ")) text += " "
      continue
    }
    const hyphenated =
      char === "-" &&
      /\p{Ll}/u.test(span[index - 1] ?? "") &&
      /\s/u.test(span[index + 1] ?? "") &&
      /^\s+\p{Ll}/u.test(span.slice(index + 1))
    if (hyphenated) {
      while (/\s/u.test(span[index + 1] ?? "")) index += 1
      continue
    }
    text += char
  }
  if (wordEnd >= span.length) end = text.length
  const trimmed = text.trimEnd()
  return { text: trimmed, wordStart: start, wordEnd: Math.min(end, trimmed.length) }
}

/** A long sentence cut to a window around the word, at word boundaries, with ellipses. */
function shortened(sentence: ExampleSentence): ExampleSentence {
  if (sentence.text.length <= MAX_SENTENCE) return sentence
  const from = Math.max(0, sentence.text.lastIndexOf(" ", sentence.wordStart - WINDOW) + 1)
  const toSpace = sentence.text.indexOf(" ", sentence.wordEnd + WINDOW)
  const to = toSpace < 0 ? sentence.text.length : toSpace
  const head = from > 0 ? "…" : ""
  const tail = to < sentence.text.length ? "…" : ""
  return {
    text: `${head}${sentence.text.slice(from, to)}${tail}`,
    wordStart: sentence.wordStart - from + head.length,
    wordEnd: sentence.wordEnd - from + head.length,
  }
}

/** The sentence of the paper the anchored word was looked up in, or null where it cannot be found. */
export function exampleSentence(
  ast: SourceDocumentAst,
  anchor: SourceAnchor,
): ExampleSentence | null {
  const text = pageText(ast, anchor.page)
  const range = wordRange(ast, anchor, text)
  if (!range) return null
  const [wordStart, wordEnd] = range
  const segments = new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)
  const segment = segments.containing(wordStart)
  if (!segment) return null
  const sentence = tidy(
    segment.segment,
    wordStart - segment.index,
    Math.min(wordEnd, segment.index + segment.segment.length) - segment.index,
  )
  return sentence.text ? shortened(sentence) : null
}
