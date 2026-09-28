import type {
  ParsedDocumentPage,
  ParsedPageBlock,
  ParsedPageLayoutBlock,
} from "../../shared/documentPageModel"
import { type LayoutRegion, layoutRegions } from "./pageTranslationLayoutRegions"
import type { PageTranslationBlock } from "./pageTranslationSource"
import {
  isSidewaysMargin,
  isSidewaysUnit,
  lineUnitParts,
  sentenceBreaks,
  sentencesOf,
} from "./parsedPageTranslation"
import type { PageTextRun } from "./pdfPageTextRuns"

const paragraphLabels = new Set<ParsedPageLayoutBlock["label"]>([
  "text",
  "list",
  "references",
  "footnote",
  "aside_text",
  "figure_title",
  "table_title",
])
const preservedStructures = new Set(["equation", "table", "figure"])
const bulletPattern = /^\s*[-•▪◦·‣∙]\s*/u
/** Korean glyphs look larger than Latin ones at one em, so they start a little smaller. */
const koreanScale = 0.94
const probeLength = 14
/** Long enough to tell "Patient currently not in…" from "Patient currently in…". */
const openingLength = 24

type Bounds = ParsedPageBlock["bounds"]

function alphanumeric(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

/** A translation that only repeats its source, link targets and marks aside. */
function unchanged(translation: string, source: string): boolean {
  const kept = alphanumeric(translation.replace(/\]\([^)]*\)/gu, "]"))
  return kept.length > 0 && kept === alphanumeric(source)
}

/** Evenly spaced slices of a sentence to look for in paragraph text; the first is its start. */
function probes(sentence: string): readonly string[] {
  const text = alphanumeric(sentence)
  if (text.length < 10) return []
  const length = Math.min(probeLength, text.length)
  const last = text.length - length
  return [...new Set([0, 0.25, 0.5, 0.75, 1].map((at) => Math.round(last * at)))].map((start) =>
    text.slice(start, start + length),
  )
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function centreInside(inner: Bounds, outer: Bounds, tolerance = 0): boolean {
  const x = inner.x + inner.width / 2
  const y = inner.y + inner.height / 2
  return (
    x >= outer.x - tolerance &&
    x <= outer.x + outer.width + tolerance &&
    y >= outer.y - tolerance &&
    y <= outer.y + outer.height + tolerance
  )
}

function horizontalOverlap(left: Bounds, right: Bounds): number {
  return Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
}

/**
 * Assigns each sentence to the layout paragraph where it starts: the next one in reading order
 * holding its opening words, or else the one holding most of it.
 */
export function alignSentences(
  sentences: readonly Pick<PageTranslationBlock, "source" | "parsedBlockId" | "id">[],
  paragraphs: readonly string[],
): readonly (number | null)[] {
  const texts = paragraphs.map(alphanumeric)
  let cursor = 0
  const indices = [...texts.keys()]
  const assigned = sentences.map((sentence) => {
    const order = [
      ...indices.filter((index) => index >= cursor),
      ...indices.filter((index) => index < cursor),
    ]
    const opening = alphanumeric(sentence.source).slice(0, openingLength)
    const starts =
      opening.length >= 10 ? order.find((index) => texts[index]?.includes(opening)) : undefined
    if (starts !== undefined) {
      cursor = starts
      return starts
    }
    const slices = probes(sentence.source)
    let best: number | null = null
    let bestScore = 1
    for (const index of order) {
      const score = slices.reduce(
        (sum, slice, position) =>
          texts[index]?.includes(slice) ? sum + (position === 0 ? 2 : 1) : sum,
        0,
      )
      if (score > bestScore) {
        best = index
        bestScore = score
      }
    }
    if (best !== null) cursor = best
    return best
  })
  // Text reads forward, so an unmatched sentence continues the paragraph before it. One with
  // nothing matched before it in its block (a running head glued to the first paragraph)
  // stays unplaced and keeps its original pixels.
  let previous: { readonly group: string | undefined; readonly paragraph: number } | null = null
  return assigned.map((paragraph, index) => {
    const group = sentences[index]?.parsedBlockId ?? sentences[index]?.id
    if (paragraph !== null) {
      previous = { group, paragraph }
      return paragraph
    }
    const before = previous
    return before !== null && before.group === group ? before.paragraph : null
  })
}

const inlineBullet = /\s+[•▪◦‣∙]\s+/u
const leadingMarker = /^\s*[-•▪◦‣∙]\s+/u

type Piece = { readonly source: string; readonly translation: string }

/**
 * A translation cut where it breaks a line or starts a list item. PDF text often runs list
 * items, or even the next paragraph, into one sentence ("…identified: • Timestamp
 * artifacts."), and the translation shows those seams as new lines and list markers. When the
 * source has as many pieces, each keeps its own source text.
 */
export function translationPieces(
  sentence: Pick<PageTranslationBlock, "source" | "translation">,
): readonly Piece[] {
  const sources = sentence.source
    .split(inlineBullet)
    .map((part) => part.trim())
    .filter(Boolean)
  // Where the source runs list items together, a translation may set the nested ones off
  // with a spaced dash ("…해당하는 경우 - 45분 창 내에…") rather than a new line.
  const itemMarker = sources.length >= 2 ? /\s+[•▪◦‣∙]\s+|\s+[-–—]\s+/u : inlineBullet
  let translations = sentence.translation
    .split(/\n+/u)
    .flatMap((line) => line.split(itemMarker))
    .map((part) => part.replace(leadingMarker, "").trim())
    .filter(Boolean)
  const colon = sentence.translation.search(/[:：]/u)
  if (translations.length === 1 && sources.length === 2 && sources[0]?.endsWith(":") && colon > 0)
    translations = [
      sentence.translation.slice(0, colon + 1).trim(),
      sentence.translation.slice(colon + 1).trim(),
    ].filter(Boolean)
  return translations.map((translation, index) => ({
    translation,
    source: translations.length === sources.length ? (sources[index] ?? "") : "",
  }))
}

/**
 * Latin words and numbers a translation keeps from its source — MAP, 45, mmol — cut to their
 * stems, so the "imputation" of a gloss still finds the source's "imputed".
 */
function keptTokens(translation: string): readonly string[] {
  return [...translation.matchAll(/[A-Za-z]{3,}|\d{2,}/gu)].map(([token]) =>
    token.toLowerCase().slice(0, 5),
  )
}

/**
 * Places a sentence that runs from one paragraph into later ones: its first piece stays where
 * it starts, and each later piece moves forward to the paragraph that holds most of the words
 * and numbers it kept, never backwards and never past where the sentence ends.
 */
type Placement = {
  readonly paragraph: number
  readonly piece: PageTranslationBlock
  /** The piece began after a line break or list marker, so it opens a new list item. */
  readonly startsItem: boolean
}

function spreadSentence(
  sentence: PageTranslationBlock,
  start: number,
  texts: readonly string[],
): readonly Placement[] {
  const tail = probes(sentence.source).at(-1)
  let end = start
  if (tail)
    for (let index = start + 1; index < Math.min(texts.length, start + 8); index += 1)
      if (texts[index]?.includes(tail)) {
        end = index
        break
      }
  const pieces = translationPieces(sentence)
  if (pieces.length < 2) return [{ paragraph: start, piece: sentence, startsItem: false }]
  if (end === start)
    return pieces.map((piece, index) => ({
      paragraph: start,
      piece: { ...sentence, ...piece },
      startsItem: index > 0,
    }))
  // A piece may itself run on into the next paragraph (a missing full stop in the PDF), so
  // spread sentence by sentence; each piece's first sentence keeps its list-item break.
  const units = pieces.flatMap((piece, index) =>
    sentencesOf(piece.translation).map((translation, position) => ({
      translation,
      source: position === 0 ? piece.source : "",
      startsItem: index > 0 && position === 0,
    })),
  )
  let current = start
  return units.map((unit, index) => {
    if (index > 0) {
      const tokens = keptTokens(`${unit.translation} ${unit.source}`)
      const score = (paragraph: number): number =>
        tokens.filter((token) => texts[paragraph]?.includes(token)).length
      let best = current
      for (let paragraph = current + 1; paragraph <= end; paragraph += 1)
        if (score(paragraph) > score(best)) best = paragraph
      current = best
    }
    return {
      paragraph: current,
      piece: { ...sentence, translation: unit.translation, source: unit.source },
      startsItem: unit.startsItem,
    }
  })
}

/** "Study design and setting." opening a paragraph: a run-in subheading set in bold. */
export function isRunInHeading(sentence: string, followedByText: boolean): boolean {
  const text = sentence.replace(bulletPattern, "").trim()
  if (!followedByText || text.length > 80 || !/^\p{Lu}/u.test(text) || !text.endsWith("."))
    return false
  if (/[,;:()]/u.test(text.slice(0, -1))) return false
  const words = text.slice(0, -1).split(/\s+/u)
  if (words.length > 8) return false
  return !words.some((word) =>
    /^(?:is|are|was|were|be|been|has|have|had|we|our|it|this|these|can|may|will|shows?|shown|used?|using)$/iu.test(
      word,
    ),
  )
}

function pointInside(x: number, y: number, bounds: Bounds): boolean {
  return (
    x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
  )
}

/**
 * Where to look for a line unit: its centre, or the middles of its two lines when PDF.js ran
 * two lines into one unit.
 */
function samplePoints(bounds: Bounds, lineHeight: number): readonly (readonly [number, number])[] {
  const x = bounds.x + bounds.width / 2
  if (bounds.height <= lineHeight * 1.4) return [[x, bounds.y + bounds.height / 2]]
  return [
    [x, bounds.y + bounds.height * 0.25],
    [x, bounds.y + bounds.height * 0.75],
  ]
}

/**
 * Each paragraph's text as the PDF itself has it inside the paragraph's box. A line unit that
 * PDF.js ran across two lines is split at its list or footnote marker, or where the next
 * paragraph opens, top half and bottom half going to the boxes they sit in. The layout
 * model's own text is used only where the PDF has none.
 */
function paragraphTexts(
  paragraphs: readonly ParsedPageLayoutBlock[],
  lines: readonly ParsedPageBlock[],
  lineHeight: number,
): readonly string[] {
  const texts = paragraphs.map((): string[] => [])
  const place = (points: readonly (readonly [number, number])[], text: string): void => {
    if (!text.trim()) return
    const indices = new Set(
      points.map(([x, y]) =>
        paragraphs.findIndex((paragraph) => pointInside(x, y, paragraph.bounds)),
      ),
    )
    for (const index of indices) if (index >= 0) texts[index]?.push(text)
  }
  const hit = ([x, y]: readonly [number, number]) =>
    paragraphs.some((paragraph) => pointInside(x, y, paragraph.bounds))
  for (const line of lines) {
    const parts = lineUnitParts(line, lineHeight, paragraphs)
    if (parts.length === 1) place(samplePoints(line.bounds, lineHeight), line.content)
    else for (const part of parts) place(part.points.filter(hit).slice(0, 1), part.content)
  }
  return paragraphs.map((paragraph, index) => texts[index]?.join(" ") || paragraph.content)
}

type ParagraphGeometry = {
  readonly rect: Bounds
  readonly lineHeight: number
  readonly pitch: number
  readonly indent: number
  readonly hang: number
  readonly bullet: boolean
  readonly centered: boolean
  /** Footnotes, each on its own line behind its marker (∗, †). */
  readonly notes: boolean
  /** Items that open with their own number — "(1)", "2.", "(b)" — and hang from it. */
  readonly enumerated: boolean
}

const noteMarker = /^\s*[∗*†‡§¶]/u
const enumerator = /^\s*(?:\(\d{1,2}\)|\d{1,2}[.)]|\([a-z]\)|[a-z][.)]|\([ivx]{1,4}\))\s/u

/** Right edge of the text column just above a box: the median of its ten nearest lines. */
function columnRightAbove(
  box: Bounds,
  lines: readonly ParsedPageBlock[],
  lineHeight: number,
): number {
  const above = lines
    .filter(
      (line) =>
        line.bounds.y + line.bounds.height <= box.y + 1 &&
        line.bounds.x <= box.x + lineHeight &&
        line.bounds.x + line.bounds.width > box.x + box.width * 0.5,
    )
    .sort((top, bottom) => bottom.bounds.y - top.bounds.y)
    .slice(0, 10)
  return median(above.map((line) => line.bounds.x + line.bounds.width)) ?? box.x + box.width
}

/**
 * A paragraph set centred, as a title page's author list and affiliations are: every line's
 * middle on the box's middle, and either ragged left edges or one line standing well clear of
 * the text's left edge in the middle of the page.
 */
function isCentered(
  box: Bounds,
  inside: readonly ParsedPageBlock[],
  lineHeight: number,
  textLeft: number,
  pageWidth: number,
): boolean {
  if (inside.length === 0) return false
  const middle = box.x + box.width / 2
  const onMiddle = inside.every(
    (line) => Math.abs(line.bounds.x + line.bounds.width / 2 - middle) <= lineHeight * 0.6,
  )
  if (!onMiddle) return false
  const lefts = inside.map((line) => line.bounds.x)
  if (inside.length >= 2) {
    // Beside the longest line, a centred paragraph's lines stop well short of the box; a
    // justified one with a hanging indent only looks centred.
    const widths = inside.map((line) => line.bounds.width).sort((a, b) => b - a)
    return (
      Math.max(...lefts) - Math.min(...lefts) > lineHeight &&
      widths.slice(1).every((width) => width < box.width * 0.9)
    )
  }
  return Math.abs(middle - pageWidth / 2) <= lineHeight && box.x - textLeft > lineHeight * 3
}

/**
 * Where a paragraph's text actually sits: the column's text edges, its first-line indent or
 * hanging list indent, and the line pitch, all read from the PDF's own text lines.
 */
function paragraphGeometry(
  paragraph: ParsedPageLayoutBlock,
  lines: readonly ParsedPageBlock[],
  pageLineHeight: number,
  page: { readonly width: number; readonly textLeft: number },
): ParagraphGeometry {
  const box = paragraph.bounds
  // A line unit PDF.js ran into the next line is twice as tall; it says nothing of the type.
  const lineHeight =
    median(
      lines
        .filter((line) => centreInside(line.bounds, box))
        .map((line) => line.bounds.height)
        .filter((height) => height <= pageLineHeight * 1.4),
    ) ?? pageLineHeight
  const single = lines.filter((line) => line.bounds.height <= lineHeight * 1.4)
  const inside = single
    .filter((line) => centreInside(line.bounds, box, lineHeight * 0.2))
    .sort((left, right) => left.bounds.y - right.bounds.y)
  // Lines of this column only: a caption or running head spanning both columns would
  // otherwise stretch a paragraph across the page.
  const column = single.filter(
    (line) =>
      line.bounds.width <= box.width * 1.15 &&
      horizontalOverlap(line.bounds, box) >= line.bounds.width * 0.5,
  )
  const counts = new Map<number, number>()
  for (const line of column) {
    const x = Math.round(line.bounds.x)
    counts.set(x, (counts.get(x) ?? 0) + 1)
  }
  const repeated = [...counts].filter(([, count]) => count >= 2).map(([x]) => x)
  const left = repeated.length > 0 ? Math.min(...repeated) : box.x
  const rights = column.map((line) => line.bounds.x + line.bounds.width).sort((a, b) => a - b)
  const ownRight = Math.max(
    Math.min(rights[Math.floor(rights.length * 0.95)] ?? box.x + box.width, box.x + box.width),
    left + lineHeight * 4,
  )
  // Footnotes and one-line paragraphs (an affiliation) are as wide as their text, but their
  // translation may run to the edge of the column above them.
  const notes =
    paragraph.label === "footnote" &&
    lines.filter(
      (line) => centreInside(line.bounds, box, lineHeight * 0.2) && noteMarker.test(line.content),
    ).length >= 2
  const ragged = paragraph.label === "footnote" || box.height < lineHeight * 1.6
  const right = ragged ? Math.max(ownRight, columnRightAbove(box, lines, lineHeight)) : ownRight
  const gaps = inside
    .slice(1)
    .map((line, index) => line.bounds.y - (inside[index]?.bounds.y ?? line.bounds.y))
    .filter((gap) => gap >= lineHeight * 0.9 && gap <= lineHeight * 2.2)
  const pitch = median(gaps) ?? lineHeight * 1.2
  const first = inside[0]
  // The layout model marks a centred caption itself (`<div style="text-align: center;">`).
  const declaredCentre = /text-align:\s*center/u.test(paragraph.content)
  if (declaredCentre || isCentered(box, inside, lineHeight, page.textLeft, page.width)) {
    const top = Math.min(box.y, first?.bounds.y ?? box.y)
    const lastLine = inside.at(-1)
    const bottom = Math.max(
      box.y + box.height,
      lastLine ? lastLine.bounds.y + lastLine.bounds.height : 0,
    )
    return {
      rect: { x: box.x, y: top, width: box.width, height: bottom - top },
      lineHeight,
      pitch,
      indent: 0,
      hang: 0,
      bullet: false,
      centered: true,
      notes: false,
      enumerated: false,
    }
  }
  const firstOnTop = first !== undefined && first.bounds.y <= box.y + pitch * 0.7
  const continuing = inside.filter((line) => line !== first || !firstOnTop)
  const continuation = median(continuing.map((line) => line.bounds.x))
  // A list item hangs on every line; a drop cap indents only the lines beside it.
  const hangingLines = continuing.filter((line) => line.bounds.x - left > lineHeight * 1.2)
  const hanging =
    continuation !== null &&
    continuation - left > lineHeight * 1.2 &&
    hangingLines.length >= continuing.length * 0.75
  // A list item starts with a marker; a hanging paragraph whose first line sits at the hanging
  // edge is the rest of an item from the previous column, and gets no marker of its own.
  const continued = hanging && firstOnTop && first.bounds.x - left > lineHeight * 1.2
  // "(1) We propose…" carries its own number: it hangs from it, with no marker added.
  const enumerated = firstOnTop && enumerator.test(first.content)
  const bullet =
    !enumerated &&
    (bulletPattern.test(paragraph.content) ||
      paragraph.label === "list" ||
      (firstOnTop && bulletPattern.test(first.content)) ||
      (hanging && !continued))
  const hang =
    bullet || hanging ? Math.max(lineHeight, (continuation ?? left + lineHeight * 1.8) - left) : 0
  const indent =
    enumerated && hanging
      ? -hang
      : !bullet && !hanging && firstOnTop && first.bounds.x - left > lineHeight * 0.4
        ? first.bounds.x - left
        : 0
  const top = Math.min(box.y, first?.bounds.y ?? box.y)
  const lastLine = inside.at(-1)
  const bottom = Math.max(
    box.y + box.height,
    lastLine ? lastLine.bounds.y + lastLine.bounds.height : 0,
  )
  return {
    rect: { x: left, y: top, width: right - left, height: bottom - top },
    lineHeight,
    pitch,
    indent,
    hang,
    bullet,
    centered: false,
    notes,
    enumerated,
  }
}

/** Runs of PDF text in page coordinates of the parsed page. */
function runsOnPage(runs: readonly PageTextRun[], page: ParsedDocumentPage) {
  return runs.map((run) => ({
    ...run,
    bounds: {
      x: run.rect.x * page.width,
      y: run.rect.y * page.height,
      width: run.rect.width * page.width,
      height: run.rect.height * page.height,
    },
  }))
}

type PlacedRun = ReturnType<typeof runsOnPage>[number]

/**
 * The bold text a paragraph's first line opens with, as its fonts set it: "" when it opens in
 * regular type, or null when the page's fonts are not known.
 */
function openingBold(box: Bounds, runs: readonly PlacedRun[] | null, lineHeight: number) {
  if (!runs) return null
  const bold: string[] = []
  for (const run of readingOrder(box, runs, lineHeight)) {
    if (!run.bold) return joinWrapped(bold)
    bold.push(run.text)
  }
  return joinWrapped(bold)
}

/** The runs inside a box in reading order: line by line, left to right. */
function readingOrder(
  box: Bounds,
  runs: readonly PlacedRun[],
  lineHeight: number,
): readonly PlacedRun[] {
  const inside = runs
    .filter((run) => centreInside(run.bounds, box, lineHeight * 0.3))
    .filter((run) => !bulletPattern.test(run.text) || run.text.trim().length > 1)
    .sort((left, right) => left.bounds.y - right.bounds.y)
  const lines: PlacedRun[][] = []
  for (const run of inside) {
    const line = lines.at(-1)
    const top = line?.[0]?.bounds.y
    if (line && top !== undefined && Math.abs(run.bounds.y - top) < lineHeight * 0.5) line.push(run)
    else lines.push([run])
  }
  return lines.flatMap((line) => line.sort((left, right) => left.bounds.x - right.bounds.x))
}

/**
 * Terms the source sets in bold inside the running text, after its opening — "1) **Submitting
 * stage**: Developers…" — as they read, without trailing punctuation.
 */
function inlineBold(
  box: Bounds,
  runs: readonly PlacedRun[] | null,
  lineHeight: number,
): readonly string[] {
  if (!runs) return []
  const phrases: string[][] = []
  let opening = true
  let previousBold = false
  for (const run of readingOrder(box, runs, lineHeight)) {
    if (!run.bold) {
      opening = false
      previousBold = false
      continue
    }
    if (opening) continue
    if (previousBold) phrases.at(-1)?.push(run.text)
    else phrases.push([run.text])
    previousBold = true
  }
  return phrases
    .map((phrase) => joinWrapped(phrase).replace(/[\s:;,.]+$/u, ""))
    .filter((phrase) => (phrase.match(/\p{L}/gu) ?? []).length >= 4)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

/**
 * Sets in bold, in a translation, the terms the source sets in bold: the Korean term with the
 * English kept after it ("제출 단계(Submitting stage)"), or the English term itself.
 */
function withInlineBold(markdown: string, phrases: readonly string[]): string {
  let text = markdown
  for (const phrase of phrases) {
    const pattern = escapeRegExp(phrase).replace(/\s+/gu, "\\s+")
    const gloss = new RegExp(`\\(\\s*${pattern}\\s*\\)`, "iu").exec(text)
    if (gloss) {
      const before = text.slice(0, gloss.index)
      const words = phrase.split(/\s+/u).length
      const term = new RegExp(
        `(?:[^\\s()*:;,.\\d]+\\s+){0,${Math.min(3, words) - 1}}[^\\s()*:;,.\\d]+$`,
        "u",
      ).exec(before)
      const start = term ? term.index : gloss.index
      const end = gloss.index + gloss[0].length
      if (text.slice(start, end).includes("**")) continue
      text = `${text.slice(0, start)}**${text.slice(start, end)}**${text.slice(end)}`
      continue
    }
    const bare = new RegExp(`(?<![\\p{L}*])${pattern}(?![\\p{L}*])`, "iu").exec(text)
    if (bare)
      text = `${text.slice(0, bare.index)}**${bare[0]}**${text.slice(bare.index + bare[0].length)}`
  }
  return text
}

/** Text runs rejoined, with words the line end hyphenated ("cir- culatory") made whole. */
function joinWrapped(runs: readonly string[]): string {
  return runs
    .join(" ")
    .replace(/(\p{Ll})-\s+(\p{Ll})/gu, "$1$2")
    .replace(/\s+/gu, " ")
    .trim()
}

/**
 * How many sentences a bold opening covers. Bold type can run past the lead into the next
 * sentence's first word — the panel letter in "Fig. 2 | Model performance. a, …".
 */
function boldSentenceCount(source: string, bold: string): number {
  const breaks = sentenceBreaks(bold)
  const covered = alphanumeric(bold.slice(0, breaks.at(-1) ?? 0))
  if (covered.length < 3) return 0
  return alphanumeric(source.replace(bulletPattern, "")).startsWith(covered) ? breaks.length : 0
}

/** Whether nearly all of the text inside a box is set in bold, as an abstract may be. */
function mostlySet(
  box: Bounds,
  runs: readonly PlacedRun[] | null,
  style: "bold" | "italic",
): boolean {
  if (!runs) return false
  let set = 0
  let total = 0
  for (const run of runs) {
    if (!centreInside(run.bounds, box)) continue
    total += run.text.length
    if (run[style]) set += run.text.length
  }
  return total > 0 && set >= total * 0.85
}

/** Whether most of the text inside a box is set in a serif face. */
function mostlySerif(box: Bounds, runs: readonly PlacedRun[] | null): boolean | undefined {
  if (!runs) return undefined
  let serif = 0
  let total = 0
  for (const run of runs) {
    if (!centreInside(run.bounds, box)) continue
    total += run.text.length
    if (run.serif) serif += run.text.length
  }
  return total === 0 ? undefined : serif * 2 >= total
}

/**
 * A paragraph's translation as Markdown. A list paragraph becomes list items, one per list
 * marker its pieces carried; a plain paragraph opens with its run-in subheading in bold.
 */
function paragraphMarkdown(
  pieces: readonly Placement[],
  geometry: ParagraphGeometry,
  leadingBold: string | null,
): string {
  const parts = pieces
    .map((placement) => ({ ...placement, text: placement.piece.translation.trim() }))
    .filter((part) => part.text.length > 0)
  const [first, ...rest] = parts
  if (first === undefined) return ""
  if (geometry.bullet) {
    const items: string[][] = []
    for (const part of parts) {
      const text = part.text.replace(bulletPattern, "")
      const item = items.at(-1)
      if (item && !part.startsItem) item.push(text)
      else items.push([text])
    }
    return items.map((item) => `- ${item.join(" ")}`).join("\n")
  }
  // The opening sentence is the run-in subheading ("Study design and setting.", "Fig. 5 | …")
  // when the PDF sets it bold; a caption translates as one piece, so split off its first
  // sentence on both sides.
  const [sourceOpening = "", ...sourceRest] = sentencesOf(first.piece.source)
  const boldCount =
    leadingBold === null
      ? geometry.indent === 0 &&
        (sourceRest.length > 0 || parts.length > 1) &&
        isRunInHeading(sourceOpening, true)
        ? 1
        : 0
      : boldSentenceCount(first.piece.source, leadingBold)
  // Bold as many sentences of the translation as the source sets in bold — all of the piece
  // when the source's bold covers it, even if the translation dropped its full stop.
  // "Keywords: large language…" is bold only up to its colon: text after the last break is not.
  const sourceBreaks = sentenceBreaks(first.piece.source)
  const whole =
    boldCount > 0 &&
    boldCount >= (sourceBreaks.length || 1) &&
    !first.piece.source.slice(sourceBreaks.at(-1) ?? 0).trim()
  const end = whole
    ? first.text.length
    : boldCount > 0
      ? sentenceBreaks(first.text)[boldCount - 1]
      : undefined
  const boldText = end === undefined ? "" : first.text.slice(0, end).replaceAll("**", "").trim()
  const lead =
    boldText && /\.$/u.test(sourceOpening) && !/[.:!?]$/u.test(boldText) ? `${boldText}.` : boldText
  const after = end === undefined ? first.text : first.text.slice(end).trim()
  // Numbered items one listed paragraph holds each start their own line.
  const tail = rest.map((part) =>
    geometry.enumerated && part.startsItem ? `\n\n${part.text}` : part.text,
  )
  const text = [...(lead ? [`**${lead}**`] : []), after, ...tail]
    .filter(Boolean)
    .join(" ")
    .replaceAll(" \n\n", "\n\n")
  return geometry.notes ? noteLines(text) : text
}

/** Footnotes one per line, each marker set against its note as the source sets it. */
function noteLines(text: string): string {
  return text
    .split(/\s+(?=[∗*†‡§¶]\s*\S)/u)
    .map((note) => note.replace(/^\*/u, "∗"))
    .join("\n\n")
}

/**
 * "Tan † , Liu † ," as PDF text spaces them → "Tan†, Liu†,", and "∗ Corresponding" →
 * "∗Corresponding": a mark hugs its word, as the source sets it.
 */
function attachedMarks(text: string): string {
  return text
    .replace(/\s+([†‡∗§¶])\s*(?=[,;)]|$)/gmu, "$1")
    .replace(/^\*\s+(?=\S)/gmu, "∗")
    .replace(/^([†‡∗§¶])\s+(?=\S)/gmu, "$1")
}

const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹"

/**
 * The number a paragraph opens with when the source raises it ("¹Peking University"), so
 * the translation raises it too; null when the paragraph opens otherwise.
 */
function raisedOpening(
  box: Bounds,
  runs: readonly PlacedRun[] | null,
  lineHeight: number,
): string | null {
  if (!runs) return null
  const [first, ...rest] = readingOrder(box, runs, lineHeight)
  if (!first || !/^\s*\d{1,2}\s*$/u.test(first.text)) return null
  const body = median(rest.map((run) => run.bounds.height))
  return body !== null && first.bounds.height < body * 0.8 ? first.text.trim() : null
}

function withRaisedOpening(translation: string, number: string | null): string {
  if (number === null) return translation
  const raised = [...number].map((digit) => superscripts[Number(digit)] ?? digit).join("")
  return translation.replace(new RegExp(`^\\s*${number}\\s*`, "u"), raised)
}

/** Drops `key` (alphanumerics only) from the start of `text`, or returns null if it is not there. */
function withoutLeading(text: string, key: string): string | null {
  let matched = 0
  let index = 0
  const characters = [...text]
  for (; index < characters.length && matched < key.length; index += 1) {
    const character = characters[index]?.toLowerCase() ?? ""
    if (!/[\p{L}\p{N}]/u.test(character)) continue
    if (character !== key[matched]) return null
    matched += 1
  }
  return matched === key.length ? characters.slice(index).join("").trim() : null
}

/**
 * PDF text sometimes runs the running head into the first sentence of the page ("Articles
 * NATURE MEDICINE Fig. 5 shows…"). Cuts such text, found outside every paragraph, from the
 * sentence and from its translation, which keeps it verbatim.
 */
function withoutRunningText(
  sentence: PageTranslationBlock,
  running: readonly string[],
): PageTranslationBlock | null {
  let current = sentence
  for (const key of running) {
    const source = withoutLeading(current.source, key)
    if (source === null) continue
    if (!source) return null
    current = {
      ...current,
      source,
      translation: withoutLeading(current.translation, key) ?? current.translation,
    }
  }
  return current
}

const referencesHeading = /^(?:#+\s*)?(?:references|bibliography|literature cited|참고\s*문헌)\b/iu

/** Layout orders of the reference list, which keeps its original typesetting. */
function referenceOrders(layout: readonly ParsedPageLayoutBlock[]): ReadonlySet<number> {
  const ordered = [...layout].sort((left, right) => left.order - right.order)
  const orders = new Set<number>()
  let inReferences = false
  for (const block of ordered) {
    if (block.label === "paragraph_title" || block.label === "doc_title")
      inReferences = referencesHeading.test(block.content.trim())
    else if (block.label === "references" || (inReferences && paragraphLabels.has(block.label)))
      orders.add(block.order)
  }
  return orders
}

/**
 * "머신러닝을 이용한 … 조기 예측(Early prediction of … machine learning)": a heading whose
 * gloss repeats the whole source keeps only the translation. A gloss of one term stays.
 */
function withoutRepeatedSource(translation: string, source: string): string {
  const match = /^(.*\S)\s*[(（]([^()（）]+)[)）]\s*$/su.exec(translation.trim())
  if (!match?.[1] || !match[2]) return translation
  const gloss = alphanumeric(match[2])
  const original = alphanumeric(source.replace(/^#{1,6}\s+/u, ""))
  return gloss.length > 0 && gloss === original ? match[1] : translation
}

/**
 * Translations made before sentences kept their abbreviations were cut after "Fig." or an
 * initial ("S.L.H., M."). Joins such a fragment, too short to place, to the sentence after
 * it in the same block.
 */
function joinFragments(blocks: readonly PageTranslationBlock[]): readonly PageTranslationBlock[] {
  const joined: PageTranslationBlock[] = []
  let pending: PageTranslationBlock | null = null
  for (const next of blocks) {
    const sameBlock =
      pending !== null && (pending.parsedBlockId ?? pending.id) === (next.parsedBlockId ?? next.id)
    const block: PageTranslationBlock =
      pending && sameBlock
        ? {
            ...next,
            source: `${pending.source} ${next.source}`,
            translation: `${pending.translation.trim()} ${next.translation.trim()}`,
          }
        : next
    if (pending && !sameBlock) joined.push(pending)
    pending = null
    if (block.kind === "body" && alphanumeric(block.source).length < 10) pending = block
    else joined.push(block)
  }
  if (pending) joined.push(pending)
  return joined
}

/**
 * Regions that follow the source paragraph by paragraph: one per layout paragraph, with its
 * indent, list marker, line pitch and run-in subheading. Bold and serif come from the PDF's
 * fonts when `runs` are known. Pages parsed without a layout get one region per parsed block.
 */
export function paragraphRegions(
  blocks: readonly PageTranslationBlock[],
  page: ParsedDocumentPage | null,
  runs: readonly PageTextRun[] | null = null,
): readonly LayoutRegion[] {
  const paragraphs = (page?.layout ?? [])
    .filter((block) => paragraphLabels.has(block.label) && !isSidewaysMargin(block))
    .sort((left, right) => left.order - right.order)
  if (!page || paragraphs.length === 0) return layoutRegions(blocks)
  const placedRuns = runs ? runsOnPage(runs, page) : null
  const textLines = page.blocks.filter((block) => block.label === "text" || block.label === "list")
  const pageLineHeight =
    median(textLines.map((line) => line.bounds.height).filter((height) => height > 0)) ?? 12
  // The page's lines, a caption's opening line among them.
  const lines = page.blocks.filter(
    (block) =>
      (block.label === "text" ||
        block.label === "list" ||
        block.label === "figure_title" ||
        block.label === "table_title") &&
      !isSidewaysUnit(block, pageLineHeight),
  )
  const lefts = new Map<number, number>()
  for (const line of lines) {
    const x = Math.round(line.bounds.x)
    lefts.set(x, (lefts.get(x) ?? 0) + 1)
  }
  const textLeft = Math.min(
    ...[...lefts].filter(([, count]) => count >= 3).map(([x]) => x),
    page.width,
  )
  const content = (page.layout ?? []).filter(
    (block) =>
      block.label !== "header" && block.label !== "footer" && block.label !== "page_number",
  )
  const running = lines
    .filter(
      (line) =>
        !samplePoints(line.bounds, pageLineHeight).some(([x, y]) =>
          content.some((block) => pointInside(x, y, block.bounds)),
        ),
    )
    .map((line) => alphanumeric(line.content))
    .filter((key) => key.length >= 6)
  const body = joinFragments(blocks).flatMap((block) => {
    if (
      block.kind !== "body" ||
      (block.structureKind && preservedStructures.has(block.structureKind))
    )
      return []
    const kept = withoutRunningText(block, running)
    return kept ? [kept] : []
  })
  const texts = paragraphTexts(paragraphs, lines, pageLineHeight)
  const starts = alignSentences(body, texts)
  const searchable = texts.map(alphanumeric)
  const placed = body.flatMap((sentence, index) => {
    const start = starts[index]
    return start === null || start === undefined ? [] : spreadSentence(sentence, start, searchable)
  })
  const references = referenceOrders(page.layout ?? [])
  const regions = paragraphs.flatMap((paragraph, index): LayoutRegion[] => {
    const pieces = placed.filter((placement) => placement.paragraph === index)
    const members = pieces.map((placement) => placement.piece)
    if (members.length === 0 || references.has(paragraph.order)) return []
    const geometry = paragraphGeometry(paragraph, lines, pageLineHeight, {
      width: page.width,
      textLeft,
    })
    // The type size the PDF sets the paragraph in; PDF.js line units run a little short of it.
    const sourceSize =
      median(
        (placedRuns ?? [])
          .filter((run) => run.text.trim().length > 1 && centreInside(run.bounds, paragraph.bounds))
          .map((run) => run.bounds.height),
      ) ?? geometry.lineHeight
    const fontSize = sourceSize * koreanScale
    const serif = mostlySerif(paragraph.bounds, placedRuns)
    const allBold = mostlySet(paragraph.bounds, placedRuns, "bold")
    const allItalic = mostlySet(paragraph.bounds, placedRuns, "italic")
    // The paragraph's glyphs: across the full box, but only as high as its lines, so a rule
    // just above a footnote survives.
    const glyphLines = lines
      .filter((line) => centreInside(line.bounds, paragraph.bounds))
      .map((line) => line.bounds)
    const across = [geometry.rect, ...glyphLines]
    const down = glyphLines.length > 0 ? glyphLines : [geometry.rect]
    const maskLeft = Math.min(...across.map((bounds) => bounds.x))
    const maskTop = Math.min(...down.map((bounds) => bounds.y))
    const maskRight = Math.max(...across.map((bounds) => bounds.x + bounds.width))
    const maskBottom = Math.max(...down.map((bounds) => bounds.y + bounds.height))
    const translation = withRaisedOpening(
      attachedMarks(
        allBold
          ? paragraphMarkdown(pieces, geometry, "")
          : withInlineBold(
              paragraphMarkdown(
                pieces,
                geometry,
                openingBold(paragraph.bounds, placedRuns, geometry.lineHeight),
              ),
              inlineBold(paragraph.bounds, placedRuns, geometry.lineHeight),
            ),
      ),
      raisedOpening(paragraph.bounds, placedRuns, geometry.lineHeight),
    )
    // Names, links and the like come back as they are: the source's own pixels say it best.
    if (unchanged(translation, texts[index] ?? paragraph.content)) return []
    return [
      {
        id: `layout:${paragraph.order}`,
        blockIds: members.map((member) => member.id),
        kind: "body",
        rect: {
          x: geometry.rect.x / page.width,
          y: geometry.rect.y / page.height,
          width: geometry.rect.width / page.width,
          height: geometry.rect.height / page.height,
        },
        translation,
        ...(allBold ? { bold: true } : {}),
        ...(allItalic ? { italic: true } : {}),
        typography: {
          fontSize: (fontSize / page.width) * 100,
          lineHeight: Math.min(2, Math.max(1.1, geometry.pitch / fontSize)),
          indent: (geometry.indent / page.width) * 100,
          hang: (geometry.hang / page.width) * 100,
          bullet: geometry.bullet,
          ...(geometry.centered ? { centered: true } : {}),
        },
        ...(serif === undefined ? {} : { serif }),
        mask: {
          x: maskLeft / page.width,
          y: maskTop / page.height,
          width: (maskRight - maskLeft) / page.width,
          height: (maskBottom - maskTop) / page.height,
        },
      },
    ]
  })
  // Body text that matches no layout paragraph — a running head, a footer — stays as the
  // original pixels rather than being painted over.
  const headings = layoutRegions(blocks.filter((block) => block.kind === "heading")).map(
    (region) => {
      const box = {
        x: region.rect.x * page.width,
        y: region.rect.y * page.height,
        width: region.rect.width * page.width,
        height: region.rect.height * page.height,
      }
      const serif = mostlySerif(box, placedRuns)
      const size = median(
        (placedRuns ?? [])
          .filter((run) => run.text.trim().length > 1 && centreInside(run.bounds, box))
          .map((run) => run.bounds.height),
      )
      const source = blocks.find((block) => block.id === region.blockIds[0])?.source ?? ""
      return {
        ...region,
        translation: withoutRepeatedSource(region.translation, source),
        ...(serif === undefined ? {} : { serif }),
        ...(size === null ? {} : { size: ((size * koreanScale) / page.width) * 100 }),
      }
    },
  )
  return [...headings, ...regions]
}
