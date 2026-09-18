import type { ParsedDocumentPage, ParsedPageBlock } from "./documentPageModel"

export type ParsedPageTranslationBlock = {
  readonly id: string
  readonly parsedBlockId: string
  readonly kind: "heading" | "body"
  readonly structureKind: "heading" | "body" | "equation"
  readonly source: string
  readonly sourceBounds: ParsedPageBlock["bounds"]
  readonly sourcePageWidth: number
  readonly sourcePageHeight: number
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

export function pageTranslationBlocksFromParsedPage(
  page: ParsedDocumentPage,
): readonly ParsedPageTranslationBlock[] {
  return [...page.blocks]
    .sort((left, right) => left.order - right.order)
    .flatMap((block) => {
      const source = block.content.trim()
      if (block.translationPolicy !== "include" || !source) return []
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
      }))
    })
}

export function planParsedPageTranslations(
  blocks: readonly ParsedPageTranslationBlock[],
): PlannedParsedPageTranslations {
  const completed = new Map<string, string>()
  const initial = blocks.map((block) => {
    const translation = block.structureKind === "equation" ? block.source : ""
    if (translation) completed.set(block.id, translation)
    return { ...block, translation }
  })
  return {
    initial,
    completed,
    translatable: blocks.filter((block) => block.structureKind !== "equation"),
  }
}

export function parsedPageBodyText(page: ParsedDocumentPage): string {
  return pageTranslationBlocksFromParsedPage(page)
    .map((block) => block.source)
    .join("\n\n")
}
