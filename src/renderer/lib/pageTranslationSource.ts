import type { ParsedDocumentPage } from "../../shared/documentPageModel"
import type { PageStructureKind } from "../../shared/pageStructure"
import { parsePageTranslationResponse } from "./pageTranslationJson"
import { bindPageTranslationSpans, sourceElementMatchesBlock } from "./pageTranslationSpanMapping"
import { normalizeExtractedPdfText } from "./pdfTextLines"

type SourceBox = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type PageSourceBlock = {
  readonly id: string
  readonly kind: "heading" | "body"
  readonly structureKind?: PageStructureKind | "figure"
  readonly source: string
  readonly parsedBlockId?: string
  readonly sourceBounds?: SourceBox
  /** A unit the page breaks across columns: one box per column, which `sourceBounds` encloses. */
  readonly sourceParts?: readonly SourceBox[]
  readonly sourcePageWidth?: number
  readonly sourcePageHeight?: number
  readonly sourceParser?: ParsedDocumentPage["parser"]
  readonly sourceParserConfigVersion?: string
}

export type PageTranslationBlock = PageSourceBlock & { readonly translation: string }

type SourceRun = {
  readonly element: HTMLElement
  readonly text: string
  readonly size: number
  readonly weight: number
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

const translationChunkLimit = 5_000
const translationBatchBlockLimit = 12

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.floor(ordered.length / 2)] ?? 0
}

function joinedSource(runs: readonly SourceRun[]): string {
  const value = runs.reduce((joined, run, index) => {
    const previous = runs[index - 1]
    if (!previous) return run.text
    const sameLine =
      Math.abs(run.top - previous.top) <= Math.max(run.height, previous.height) * 0.55
    const gap = run.left - (previous.left + previous.width)
    const touchingGlyphs = sameLine && gap <= Math.max(2, Math.min(run.size, previous.size) * 0.16)
    const hyphenatedLine = !sameLine && /\p{Ll}-$/u.test(joined) && /^\p{Ll}/u.test(run.text)
    const prefix = hyphenatedLine ? joined.slice(0, -1) : joined
    return `${prefix}${touchingGlyphs || hyphenatedLine ? "" : " "}${run.text}`
  }, "")
  return normalizeExtractedPdfText(value)
    .replaceAll("ﬁ", "fi")
    .replaceAll("ﬂ", "fl")
    .replace(/(?<=\p{Ll})-\s+(?=\p{Ll})/gu, "")
}

function sentenceEnds(value: string): boolean {
  return /[.!?](?:[”’"')\]])?(?:\s*\d+(?:[–,-]\d+)*)?$/u.test(value)
}

export function clearPageSourceMapping(pageNumber: number): void {
  const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  for (const span of page?.querySelectorAll<HTMLElement>("[data-page-translation-block]") ?? []) {
    span.removeAttribute("data-page-translation-block")
    span.removeAttribute("data-page-translation-active")
  }
  const overlay = document.querySelector<HTMLElement>(
    `.paper-structure-host > [data-page-number="${pageNumber}"]`,
  )
  for (const bound of overlay?.querySelectorAll<HTMLElement>(".page-translation-source-bound") ??
    [])
    bound.remove()
}

export function bindPageSourceBounds(pageNumber: number, blocks: readonly PageSourceBlock[]): void {
  clearPageSourceMapping(pageNumber)
  const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  const matched = bindPageTranslationSpans(page, blocks)
  const overlay = document.querySelector<HTMLElement>(
    `.paper-structure-host > [data-page-number="${pageNumber}"]`,
  )
  if (!overlay) return
  // The sentences of one paragraph share its box: one element carries them all, so the box
  // is tinted once when they light up, not once per sentence.
  const bounds = new Map<string, HTMLElement>()
  for (const block of blocks) {
    if (matched.has(block.id)) continue
    if (!block.sourceBounds || !block.sourcePageWidth || !block.sourcePageHeight) continue
    for (const box of block.sourceParts ?? [block.sourceBounds]) {
      const left = `${(box.x / block.sourcePageWidth) * 100}%`
      const top = `${(box.y / block.sourcePageHeight) * 100}%`
      const width = `${(box.width / block.sourcePageWidth) * 100}%`
      const height = `${(box.height / block.sourcePageHeight) * 100}%`
      const key = [left, top, width, height].join("/")
      const shared = bounds.get(key)
      if (shared) {
        const ids = shared.getAttribute("data-page-translation-block")?.split(",") ?? []
        shared.setAttribute("data-page-translation-block", [...ids, block.id].join(","))
        continue
      }
      const bound = document.createElement("div")
      bound.className = "page-translation-source-bound"
      bound.setAttribute("data-page-translation-block", block.id)
      bound.style.left = left
      bound.style.top = top
      bound.style.width = width
      bound.style.height = height
      overlay.append(bound)
      bounds.set(key, bound)
    }
  }
}

export function setPageSourceActive(pageNumber: number, blockId: string, active: boolean): void {
  const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  const overlay = document.querySelector<HTMLElement>(
    `.paper-structure-host > [data-page-number="${pageNumber}"]`,
  )
  const elements = [
    ...(page?.querySelectorAll<HTMLElement>("[data-page-translation-block]") ?? []),
    ...(overlay?.querySelectorAll<HTMLElement>("[data-page-translation-block]") ?? []),
  ]
  for (const span of elements) {
    if (!sourceElementMatchesBlock(span, blockId)) continue
    if (active) span.setAttribute("data-page-translation-active", "true")
    else span.removeAttribute("data-page-translation-active")
  }
}

/**
 * Translation block ids under a pointer on a PDF page: a mapped text-layer span, or a
 * source bound drawn for a block whose spans could not be matched.
 */
export function pageSourceBlockIdsAt(
  pageNumber: number,
  target: EventTarget | null,
  point: { readonly x: number; readonly y: number },
): readonly string[] {
  if (!(target instanceof Element)) return []
  const page = target.closest<HTMLElement>(".page[data-page-number]")
  if (page?.getAttribute("data-page-number") !== String(pageNumber)) return []
  const span = target.closest<HTMLElement>("[data-page-translation-block]")
  if (span && page.contains(span))
    return span.getAttribute("data-page-translation-block")?.split(",").filter(Boolean) ?? []
  const overlay = document.querySelector<HTMLElement>(
    `.paper-structure-host > [data-page-number="${pageNumber}"]`,
  )
  const bound = [
    ...(overlay?.querySelectorAll<HTMLElement>(".page-translation-source-bound") ?? []),
  ].find((element) => {
    const rect = element.getBoundingClientRect()
    return (
      point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    )
  })
  return bound?.getAttribute("data-page-translation-block")?.split(",").filter(Boolean) ?? []
}

export function focusPageSource(pageNumber: number, blockId: string): void {
  const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  const overlay = document.querySelector<HTMLElement>(
    `.paper-structure-host > [data-page-number="${pageNumber}"]`,
  )
  const elements = [
    ...(page?.querySelectorAll<HTMLElement>("[data-page-translation-block]") ?? []),
    ...(overlay?.querySelectorAll<HTMLElement>("[data-page-translation-block]") ?? []),
  ]
  const source = elements.find((element) => sourceElementMatchesBlock(element, blockId))
  if (!source) return
  setPageSourceActive(pageNumber, blockId, true)
  source.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" })
}

export function extractPageSourceBlocks(pageNumber: number): readonly PageSourceBlock[] | null {
  const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  if (!page) return null
  clearPageSourceMapping(pageNumber)
  const runs = [...page.querySelectorAll<HTMLElement>(".textLayer span")].flatMap((element) => {
    const text = element.textContent?.trim() ?? ""
    const rect = element.getBoundingClientRect()
    if (!text || rect.width <= 0 || rect.height <= 0) return []
    const style = getComputedStyle(element)
    const weight = Number.parseInt(style.fontWeight, 10)
    return [
      {
        element,
        text,
        size: Number.parseFloat(style.fontSize) || rect.height,
        weight,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    ]
  })
  if (runs.length === 0) return null
  const bodySize = median(runs.filter((run) => run.text.length >= 12).map((run) => run.size))
  const blocks: PageSourceBlock[] = []
  let parts: SourceRun[] = []
  let kind: PageSourceBlock["kind"] = "body"
  const flush = (): void => {
    const source = joinedSource(parts)
    if (!source) return
    const id = `p${pageNumber}-b${blocks.length + 1}`
    blocks.push({ id, kind, source })
    for (const part of parts) part.element.setAttribute("data-page-translation-block", id)
    parts = []
    kind = "body"
  }
  for (const run of runs) {
    const heading =
      run.text.length <= 160 && (run.size >= Math.max(12, bodySize * 1.14) || run.weight >= 650)
    const previous = parts.at(-1)
    const visualGap = previous ? run.top - (previous.top + previous.height) : 0
    const nextKind = heading ? "heading" : "body"
    if (
      parts.length > 0 &&
      (nextKind !== kind || visualGap > Math.max(run.height, previous?.height ?? 0) * 0.9)
    )
      flush()
    kind = nextKind
    parts.push(run)
    const source = joinedSource(parts)
    if ((!heading && sentenceEnds(source)) || source.length >= 360) flush()
  }
  flush()
  return blocks.length > 0 ? blocks : null
}

export function pageTranslationBatches(
  blocks: readonly PageSourceBlock[],
): readonly (readonly PageSourceBlock[])[] {
  const batches: PageSourceBlock[][] = []
  let current: PageSourceBlock[] = []
  for (const block of blocks) {
    const candidate = [...current, block]
    if (
      current.length > 0 &&
      (current.length >= translationBatchBlockLimit ||
        pageTranslationRequest(candidate).length > translationChunkLimit)
    ) {
      batches.push(current)
      current = []
    }
    current.push(block)
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export function pageTranslationRequest(blocks: readonly PageSourceBlock[]): string {
  return JSON.stringify({ blocks: blocks.map(({ id, kind, source }) => ({ id, kind, source })) })
}

export function parsePageTranslationStream(value: string): ReadonlyMap<string, string> {
  const parsed = parsePageTranslationResponse(value)
  return new Map(
    parsed?.translations.map((translation) => [translation.id, translation.markdown]) ?? [],
  )
}

export function pageTranslationBlockIds(value: string): readonly string[] {
  return parsePageTranslationResponse(value)?.translations.map(({ id }) => id) ?? []
}
