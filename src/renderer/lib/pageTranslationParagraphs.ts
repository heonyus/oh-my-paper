import type {
  ParsedDocumentPage,
  ParsedPageBlock,
  ParsedPageLayoutBlock,
} from "../../shared/documentPageModel"
import { type LayoutRegion, layoutRegions } from "./pageTranslationLayoutRegions"
import type { PageTranslationBlock } from "./pageTranslationSource"
import { sentenceBreaks, sentencesOf } from "./parsedPageTranslation"
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
 * PDF.js ran across two lines is split at its list marker, top half and bottom half going to
 * the boxes they sit in. The layout model's own text is used only where the PDF has none.
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
  for (const line of lines) {
    const [top, bottom] = samplePoints(line.bounds, lineHeight)
    const [upper = "", ...lower] = line.content.split(inlineBullet)
    if (top && bottom && lower.length > 0) {
      place([top], upper)
      place([bottom], lower.join(" • "))
    } else place(samplePoints(line.bounds, lineHeight), line.content)
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
}

/**
 * Where a paragraph's text actually sits: the column's text edges, its first-line indent or
 * hanging list indent, and the line pitch, all read from the PDF's own text lines.
 */
function paragraphGeometry(
  paragraph: ParsedPageLayoutBlock,
  lines: readonly ParsedPageBlock[],
  pageLineHeight: number,
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
  const right = Math.max(
    Math.min(rights[Math.floor(rights.length * 0.95)] ?? box.x + box.width, box.x + box.width),
    left + lineHeight * 4,
  )
  const gaps = inside
    .slice(1)
    .map((line, index) => line.bounds.y - (inside[index]?.bounds.y ?? line.bounds.y))
    .filter((gap) => gap >= lineHeight * 0.9 && gap <= lineHeight * 2.2)
  const pitch = median(gaps) ?? lineHeight * 1.2
  const first = inside[0]
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
  const bullet =
    bulletPattern.test(paragraph.content) ||
    paragraph.label === "list" ||
    (firstOnTop && bulletPattern.test(first.content)) ||
    (hanging && !continued)
  const indent =
    !bullet && !hanging && firstOnTop && first.bounds.x - left > lineHeight * 0.4
      ? first.bounds.x - left
      : 0
  const hang =
    bullet || hanging ? Math.max(lineHeight, (continuation ?? left + lineHeight * 1.8) - left) : 0
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
  const inside = runs
    .filter((run) => centreInside(run.bounds, box, lineHeight * 0.3))
    .filter((run) => !bulletPattern.test(run.text) || run.text.trim().length > 1)
    .sort((left, right) => left.bounds.y - right.bounds.y)
  // Reading order: line by line, left to right. A subheading may wrap onto a second line.
  const lines: PlacedRun[][] = []
  for (const run of inside) {
    const line = lines.at(-1)
    const top = line?.[0]?.bounds.y
    if (line && top !== undefined && Math.abs(run.bounds.y - top) < lineHeight * 0.5) line.push(run)
    else lines.push([run])
  }
  const bold: string[] = []
  for (const line of lines) {
    for (const run of line.sort((left, right) => left.bounds.x - right.bounds.x)) {
      if (!run.bold) return joinWrapped(bold)
      bold.push(run.text)
    }
  }
  return joinWrapped(bold)
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
function mostlyBold(box: Bounds, runs: readonly PlacedRun[] | null): boolean {
  if (!runs) return false
  let bold = 0
  let total = 0
  for (const run of runs) {
    if (!centreInside(run.bounds, box)) continue
    total += run.text.length
    if (run.bold) bold += run.text.length
  }
  return total > 0 && bold >= total * 0.85
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
  const whole = boldCount > 0 && boldCount >= (sentenceBreaks(first.piece.source).length || 1)
  const end = whole
    ? first.text.length
    : boldCount > 0
      ? sentenceBreaks(first.text)[boldCount - 1]
      : undefined
  const boldText = end === undefined ? "" : first.text.slice(0, end).replaceAll("**", "").trim()
  const lead =
    boldText && /\.$/u.test(sourceOpening) && !/[.:!?]$/u.test(boldText) ? `${boldText}.` : boldText
  const after = end === undefined ? first.text : first.text.slice(end).trim()
  return [...(lead ? [`**${lead}**`] : []), after, ...rest.map((part) => part.text)]
    .filter(Boolean)
    .join(" ")
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
    .filter((block) => paragraphLabels.has(block.label))
    .sort((left, right) => left.order - right.order)
  if (!page || paragraphs.length === 0) return layoutRegions(blocks)
  const placedRuns = runs ? runsOnPage(runs, page) : null
  const lines = page.blocks.filter((block) => block.label === "text" || block.label === "list")
  const pageLineHeight =
    median(lines.map((line) => line.bounds.height).filter((height) => height > 0)) ?? 12
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
    const geometry = paragraphGeometry(paragraph, lines, pageLineHeight)
    // The type size the PDF sets the paragraph in; PDF.js line units run a little short of it.
    const sourceSize =
      median(
        (placedRuns ?? [])
          .filter((run) => run.text.trim().length > 1 && centreInside(run.bounds, paragraph.bounds))
          .map((run) => run.bounds.height),
      ) ?? geometry.lineHeight
    const fontSize = sourceSize * koreanScale
    const serif = mostlySerif(paragraph.bounds, placedRuns)
    const allBold = mostlyBold(paragraph.bounds, placedRuns)
    const glyphs = [
      geometry.rect,
      ...lines
        .filter((line) => centreInside(line.bounds, paragraph.bounds))
        .map((line) => line.bounds),
    ]
    const maskLeft = Math.min(...glyphs.map((bounds) => bounds.x))
    const maskTop = Math.min(...glyphs.map((bounds) => bounds.y))
    const maskRight = Math.max(...glyphs.map((bounds) => bounds.x + bounds.width))
    const maskBottom = Math.max(...glyphs.map((bounds) => bounds.y + bounds.height))
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
        translation: allBold
          ? paragraphMarkdown(pieces, geometry, "")
          : paragraphMarkdown(
              pieces,
              geometry,
              openingBold(paragraph.bounds, placedRuns, geometry.lineHeight),
            ),
        ...(allBold ? { bold: true } : {}),
        typography: {
          fontSize: (fontSize / page.width) * 100,
          lineHeight: Math.min(2, Math.max(1.1, geometry.pitch / fontSize)),
          indent: (geometry.indent / page.width) * 100,
          hang: (geometry.hang / page.width) * 100,
          bullet: geometry.bullet,
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
