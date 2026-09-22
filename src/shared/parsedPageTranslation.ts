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

function sentenceSources(block: ParsedPageBlock, source: string): readonly string[] {
  if (block.label !== "text" && block.label !== "list") return [source]
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })
  const sentences = [...segmenter.segment(source)]
    .map(({ segment }) => segment.trim())
    .filter((sentence) => sentence.length > 0)
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

export function pageTranslationBlocksFromParsedPage(
  page: ParsedDocumentPage,
): readonly ParsedPageTranslationBlock[] {
  return [...mergeAdjacentTextBlocks(page)]
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
