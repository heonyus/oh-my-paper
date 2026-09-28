import type { ParsedDocumentPage, ParsedPageBlock } from "./documentPageModel"

export type ParsedPageTranslationBlock = {
  readonly id: string
  readonly parsedBlockId: string
  readonly kind: "heading" | "body"
  readonly structureKind: "heading" | "body" | "equation" | "table" | "figure"
  readonly source: string
  readonly sourceBounds: ParsedPageBlock["bounds"]
  readonly sourcePageWidth: number
  readonly sourcePageHeight: number
  readonly sourceParser: ParsedDocumentPage["parser"]
  readonly sourceParserConfigVersion: string
}

export type PlannedParsedPageTranslations = {
  readonly initial: readonly (ParsedPageTranslationBlock & { readonly translation: string })[]
  readonly completed: ReadonlyMap<string, string>
  readonly translatable: readonly ParsedPageTranslationBlock[]
}

function translationKind(
  label: ParsedPageBlock["label"],
): ParsedPageTranslationBlock["structureKind"] {
  return label === "doc_title" || label === "paragraph_title"
    ? "heading"
    : label === "equation"
      ? "equation"
      : label === "table"
        ? "table"
        : label === "image"
          ? "figure"
          : "body"
}

function isNumberedMarker(value: string): boolean {
  const marker = value.trim()
  const suffix = marker.at(-1)
  const digits = marker.slice(0, -1)
  return (
    (suffix === "." || suffix === ")") &&
    digits.length > 0 &&
    [...digits].every((character) => character >= "0" && character <= "9")
  )
}

function attachNumberedMarkers(sentences: readonly string[]): readonly string[] {
  const attached: string[] = []
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index]
    const next = sentences[index + 1]
    if (sentence && next && isNumberedMarker(sentence)) {
      attached.push(`${sentence} ${next}`)
      index += 1
    } else if (sentence) attached.push(sentence)
  }
  return attached
}

/** Words whose full stop ends an abbreviation, not a sentence: "Fig. 5", "Smith et al. 2019". */
const abbreviatedWord = /\b(?:figs?|eqs?|tabs?|refs?|nos?|vol|vs|cf|approx|suppl|al|e\.g|i\.e)\.$/iu
/** An author's initial: "M. Hüser". */
const initial = /(?:^|\s)\p{Lu}\.$/u

/**
 * Offsets just past each full stop, colon, question or exclamation mark that ends a sentence
 * in `text` — not after an abbreviation or an initial, whatever case follows.
 */
export function sentenceBreaks(text: string): readonly number[] {
  return [...text.matchAll(/[.:!?](?=\s|$)/gu)]
    .map((match) => match.index + 1)
    .filter((end) => {
      const upTo = text.slice(0, end)
      return !abbreviatedWord.test(upTo) && !initial.test(upTo)
    })
}

/** Sentences of `text`, not cut after abbreviations or initials. */
export function sentencesOf(text: string): readonly string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })
  const sentences: string[] = []
  for (const { segment } of segmenter.segment(text)) {
    const sentence = segment.trim()
    if (!sentence) continue
    const previous = sentences.at(-1)
    if (previous !== undefined && (abbreviatedWord.test(previous) || initial.test(previous)))
      sentences[sentences.length - 1] = `${previous} ${sentence}`
    else sentences.push(sentence)
  }
  return sentences
}

function sentenceSources(block: ParsedPageBlock, source: string): readonly string[] {
  if (block.label !== "text" && block.label !== "list") return [source]
  const sentences = sentencesOf(source)
  return sentences.length > 0 ? attachNumberedMarkers(sentences) : [source]
}

function mergeAdjacentTextBlocks(page: ParsedDocumentPage): readonly ParsedPageBlock[] {
  const merged: ParsedPageBlock[] = []
  for (const block of [...page.blocks].sort((left, right) => left.order - right.order)) {
    const previous = merged.at(-1)
    if (
      previous &&
      (previous.label === "text" || previous.label === "list") &&
      (block.label === "text" || block.label === "list")
    ) {
      const columnDistance = Math.abs(previous.bounds.x - block.bounds.x)
      const previousBottom = previous.bounds.y + previous.bounds.height
      const verticalGap = block.bounds.y - previousBottom
      const sameColumn = columnDistance <= Math.max(24, page.width * 0.06)
      const adjacentLine =
        verticalGap >= -previous.bounds.height * 0.25 &&
        verticalGap <= Math.max(previous.bounds.height, block.bounds.height) * 1.2
      if (sameColumn && adjacentLine) {
        const right = Math.max(
          previous.bounds.x + previous.bounds.width,
          block.bounds.x + block.bounds.width,
        )
        const bottom = Math.max(
          previous.bounds.y + previous.bounds.height,
          block.bounds.y + block.bounds.height,
        )
        merged[merged.length - 1] = {
          ...previous,
          bounds: {
            x: Math.min(previous.bounds.x, block.bounds.x),
            y: Math.min(previous.bounds.y, block.bounds.y),
            width: right - Math.min(previous.bounds.x, block.bounds.x),
            height: bottom - Math.min(previous.bounds.y, block.bounds.y),
          },
          content: `${previous.content.trim()} ${block.content.trim()}`.trim(),
        }
        continue
      }
    }
    merged.push(block)
  }
  return merged
}

function equationSource(block: ParsedPageBlock, source: string): string {
  if (block.label !== "equation" || block.contentFormat !== "latex") return source
  if (/\$\$|\\\(|\\\)|\\\[|\\\]/u.test(source)) return source
  return `$$\n${source}\n$$`
}

function isFigureLabel(block: ParsedPageBlock, page: ParsedDocumentPage): boolean {
  if (block.label !== "text" && block.label !== "list") return false
  if (!/^[a-z]$/iu.test(block.content.trim())) return false
  const centerX = block.bounds.x + block.bounds.width / 2
  const centerY = block.bounds.y + block.bounds.height / 2
  return page.blocks.some(
    (visual) =>
      (visual.label === "image" || visual.label === "chart") &&
      centerX >= visual.bounds.x &&
      centerX <= visual.bounds.x + visual.bounds.width &&
      centerY >= visual.bounds.y &&
      centerY <= visual.bounds.y + visual.bounds.height,
  )
}

const layoutParagraphLabels = new Set<ParsedPageBlock["label"]>([
  "text",
  "list",
  "references",
  "footnote",
  "aside_text",
  "figure_title",
  "table_title",
])
const paragraphLineLabels = new Set<ParsedPageBlock["label"]>([
  "text",
  "list",
  "figure_title",
  "table_title",
])
const inlineListMarker = /\s+[•▪◦‣∙]\s+/u

type LinePart = {
  readonly block: ParsedPageBlock
  readonly part: number
  readonly content: string
  readonly bounds: ParsedPageBlock["bounds"]
  readonly points: readonly (readonly [number, number])[]
}

function inside(x: number, y: number, bounds: ParsedPageBlock["bounds"]): boolean {
  return (
    x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
  )
}

/**
 * A PDF.js line unit, or its two halves when it ran two lines together across a list marker,
 * with the points to find its paragraph by: its centre, then the middles of its lines.
 */
function lineParts(block: ParsedPageBlock, lineHeight: number): readonly LinePart[] {
  const { x, y, width, height } = block.bounds
  const middle = x + width / 2
  const tall = height > lineHeight * 1.4
  const [upper = "", ...lower] = block.content.split(inlineListMarker)
  if (tall && lower.length > 0) {
    const half = height / 2
    return [
      {
        block,
        part: 0,
        content: upper,
        bounds: { x, y, width, height: half },
        points: [[middle, y + height * 0.25]],
      },
      {
        block,
        part: 1,
        content: `• ${lower.join(" • ")}`,
        bounds: { x, y: y + half, width, height: half },
        points: [[middle, y + height * 0.75]],
      },
    ]
  }
  const points: (readonly [number, number])[] = [[middle, y + height / 2]]
  if (tall) points.push([middle, y + height * 0.25], [middle, y + height * 0.75])
  return [{ block, part: 0, content: block.content, bounds: block.bounds, points }]
}

/**
 * The page's text lines gathered into the layout model's paragraphs, so a translation unit —
 * and every sentence cut from it — stays inside one source paragraph. Lines outside every
 * paragraph (a running head, a footer) stay on their own. Null without a layout.
 */
function layoutParagraphBlocks(page: ParsedDocumentPage): readonly ParsedPageBlock[] | null {
  const paragraphs = (page.layout ?? []).filter((block) => layoutParagraphLabels.has(block.label))
  if (paragraphs.length === 0) return null
  const heights = page.blocks
    .filter((block) => block.label === "text" || block.label === "list")
    .map((block) => block.bounds.height)
    .sort((left, right) => left - right)
  const lineHeight = heights[Math.floor(heights.length / 2)] ?? 12
  const groups = new Map<number, LinePart[]>()
  const loose: ParsedPageBlock[] = []
  for (const block of page.blocks) {
    if (!paragraphLineLabels.has(block.label) || block.translationPolicy !== "include") {
      loose.push(block)
      continue
    }
    for (const part of lineParts(block, lineHeight)) {
      const index = part.points
        .map(([x, y]) => paragraphs.findIndex((paragraph) => inside(x, y, paragraph.bounds)))
        .find((found) => found >= 0)
      if (index === undefined) {
        loose.push({ ...block, content: part.content, bounds: part.bounds })
        continue
      }
      groups.set(index, [...(groups.get(index) ?? []), part])
    }
  }
  const gathered = [...groups.values()].flatMap((parts): ParsedPageBlock[] => {
    const first = parts[0]
    if (!first) return []
    const left = Math.min(...parts.map((part) => part.bounds.x))
    const top = Math.min(...parts.map((part) => part.bounds.y))
    const right = Math.max(...parts.map((part) => part.bounds.x + part.bounds.width))
    const bottom = Math.max(...parts.map((part) => part.bounds.y + part.bounds.height))
    return [
      {
        ...first.block,
        id: first.part === 0 ? first.block.id : `${first.block.id}.${first.part}`,
        order: first.block.order + first.part / 2,
        bounds: { x: left, y: top, width: right - left, height: bottom - top },
        content: parts
          .map((part) => part.content.trim())
          .filter(Boolean)
          .join(" "),
      },
    ]
  })
  return [...loose, ...joinContinuations(gathered)]
}

/**
 * A sentence the page breaks across columns — "…different dilutions of" | "vasopressors,
 * different probe locations…" — is one translation unit, so it is translated whole instead
 * of as two fragments. Its paragraphs are told apart again when it is laid out.
 */
function joinContinuations(blocks: readonly ParsedPageBlock[]): readonly ParsedPageBlock[] {
  const joined: ParsedPageBlock[] = []
  for (const block of [...blocks].sort((left, right) => left.order - right.order)) {
    const previous = joined.at(-1)
    const unfinished = previous && !/[.!?:;]["'”’)\]]*$/u.test(previous.content.trim())
    if (previous && unfinished && /^\p{Ll}/u.test(block.content.trim())) {
      const left = Math.min(previous.bounds.x, block.bounds.x)
      const top = Math.min(previous.bounds.y, block.bounds.y)
      const right = Math.max(
        previous.bounds.x + previous.bounds.width,
        block.bounds.x + block.bounds.width,
      )
      const bottom = Math.max(
        previous.bounds.y + previous.bounds.height,
        block.bounds.y + block.bounds.height,
      )
      joined[joined.length - 1] = {
        ...previous,
        bounds: { x: left, y: top, width: right - left, height: bottom - top },
        content: `${previous.content.trim()} ${block.content.trim()}`,
      }
    } else joined.push(block)
  }
  return joined
}

export function pageTranslationBlocksFromParsedPage(
  page: ParsedDocumentPage,
): readonly ParsedPageTranslationBlock[] {
  return [...(layoutParagraphBlocks(page) ?? mergeAdjacentTextBlocks(page))]
    .sort((left, right) => left.order - right.order)
    .filter((block) => !isFigureLabel(block, page))
    .flatMap((block) => {
      const rawSource = block.content.trim() || (block.label === "image" ? "원본 그림" : "")
      const source = equationSource(block, rawSource)
      const preservedVisual = block.label === "table" || block.label === "image"
      if ((!preservedVisual && block.translationPolicy !== "include") || !source) return []
      const structureKind = translationKind(block.label)
      return sentenceSources(block, source).map((sentence, index) => ({
        id:
          block.label === "text" || block.label === "list"
            ? `${block.id}:sentence:${index + 1}`
            : block.id,
        parsedBlockId: block.id,
        kind: structureKind === "heading" ? "heading" : "body",
        structureKind,
        source: sentence,
        sourceBounds: block.bounds,
        sourcePageWidth: page.width,
        sourcePageHeight: page.height,
        sourceParser: page.parser,
        sourceParserConfigVersion: page.configVersion,
      }))
    })
}

export function planParsedPageTranslations(
  blocks: readonly ParsedPageTranslationBlock[],
): PlannedParsedPageTranslations {
  const completed = new Map<string, string>()
  const initial = blocks.map((block) => {
    const translation =
      block.structureKind === "equation" ||
      block.structureKind === "table" ||
      block.structureKind === "figure"
        ? block.source
        : ""
    if (translation) completed.set(block.id, translation)
    return { ...block, translation }
  })
  return {
    initial,
    completed,
    translatable: blocks.filter(
      (block) =>
        block.structureKind !== "equation" &&
        block.structureKind !== "table" &&
        block.structureKind !== "figure",
    ),
  }
}

export function parsedPageBodyText(page: ParsedDocumentPage): string {
  return pageTranslationBlocksFromParsedPage(page)
    .map((block) => block.source)
    .join("\n\n")
}
