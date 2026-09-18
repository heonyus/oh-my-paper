import { normalizeExtractedPdfText } from "./pdfTextLines"

type SectionSpan = {
  readonly text: string
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

export type SectionAnchor = {
  readonly page: HTMLElement
  readonly heading: string
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

const hierarchyCache = new WeakMap<HTMLElement, Map<string, string>>()

function sectionSpans(page: HTMLElement): readonly SectionSpan[] {
  const pageRect = page.getBoundingClientRect()
  return [...page.querySelectorAll<HTMLElement>(".textLayer span")]
    .map((span) => {
      const rect = span.getBoundingClientRect()
      return {
        text: span.textContent?.trim() ?? "",
        top: rect.top - pageRect.top,
        left: rect.left - pageRect.left,
        width: rect.width,
        height: rect.height,
      }
    })
    .filter((span) => span.text)
    .sort((left, right) => left.top - right.top || left.left - right.left)
}

function sectionId(text: string): string | null {
  return text.match(/^\s*(\d+(?:\.\d+)*)\.?(?:\s|$)/u)?.[1] ?? null
}

function pageNumber(page: HTMLElement): number {
  return Number(page.getAttribute("data-page-number"))
}

function visibleBodySpans(page: HTMLElement): readonly SectionSpan[] {
  const height = page.getBoundingClientRect().height
  return sectionSpans(page).filter(
    (span) =>
      span.top >= height * 0.065 &&
      span.top <= height * 0.985 &&
      !/^\s*\d+\s*$/u.test(span.text) &&
      !/^https?:\/\//iu.test(span.text),
  )
}

function boundedContext(value: string, limit: number): string {
  if (value.length <= limit) return value
  const endingLength = Math.min(1_800, Math.floor(limit * 0.28))
  const beginning = value.slice(0, limit - endingLength - 28)
  const ending = value.slice(-endingLength)
  return `${beginning}\n\n[절 후반부 계속]\n\n${ending}`
}

export function nearestSectionAnchor(
  viewer: HTMLElement,
  currentPage: HTMLElement,
  beforeTop: number,
): SectionAnchor | null {
  const pages = [...viewer.querySelectorAll<HTMLElement>(".page")]
    .filter((page) => pageNumber(page) <= pageNumber(currentPage))
    .sort((left, right) => pageNumber(right) - pageNumber(left))
  for (const page of pages) {
    const limit = page === currentPage ? beforeTop : Number.POSITIVE_INFINITY
    const candidate = [...visibleBodySpans(page)]
      .reverse()
      .find((span) => span.top < limit && sectionId(span.text))
    if (candidate)
      return {
        page,
        heading: candidate.text,
        top: candidate.top,
        left: candidate.left,
        width: candidate.width,
        height: candidate.height,
      }
  }
  return null
}

function sentenceComplete(value: string): boolean {
  return /[.!?]$/u.test(value.trim())
}

function unnumberedHeadingBoundary(
  current: SectionSpan,
  previous: SectionSpan | undefined,
  anchorHeight: number,
): boolean {
  if (sectionId(current.text)) return true
  if (!previous) return false
  const gap = current.top - (previous.top + previous.height)
  return (
    gap >= anchorHeight * 1.35 &&
    current.height >= anchorHeight * 0.9 &&
    current.text.length <= 120 &&
    /^[\p{Lu}\d]/u.test(current.text) &&
    /[.:]$/u.test(current.text)
  )
}

function unnumberedSectionContext(
  viewer: HTMLElement,
  anchor: SectionAnchor,
  maximumCharacters: number,
): string {
  const pages = [...viewer.querySelectorAll<HTMLElement>(".page")]
    .filter((page) => pageNumber(page) >= pageNumber(anchor.page))
    .sort((left, right) => pageNumber(left) - pageNumber(right))
  const selected: string[] = []
  let complete = false
  for (const page of pages) {
    let previous: SectionSpan | undefined
    for (const span of visibleBodySpans(page)) {
      if (page === anchor.page) {
        if (span.top < anchor.top - 2) continue
        const sameLine = Math.abs(span.top - anchor.top) < anchor.height * 0.5
        if (sameLine && span.left < anchor.left + anchor.width - 2) continue
      }
      if (selected.length > 0 && unnumberedHeadingBoundary(span, previous, anchor.height)) {
        complete = true
        break
      }
      selected.push(span.text)
      previous = span
    }
    if (complete || sentenceComplete(selected.join(" "))) break
  }
  return boundedContext(normalizeExtractedPdfText(selected.join(" ")), maximumCharacters)
}

export function hierarchicalSectionContext({
  viewer,
  anchor,
  maximumCharacters,
}: {
  readonly viewer: HTMLElement
  readonly anchor: SectionAnchor
  readonly maximumCharacters: number
}): string {
  const target = sectionId(anchor.heading)
  const cacheTarget = target ?? normalizeExtractedPdfText(anchor.heading)
  const cacheKey = `${pageNumber(anchor.page)}:${cacheTarget}:${maximumCharacters}`
  const cache = hierarchyCache.get(viewer) ?? new Map<string, string>()
  hierarchyCache.set(viewer, cache)
  const cached = cache.get(cacheKey)
  if (cached) return cached
  if (!target) {
    const value = unnumberedSectionContext(viewer, anchor, maximumCharacters)
    if (value) cache.set(cacheKey, value)
    return value
  }
  const targetLevel = target.split(".").length
  const pages = [...viewer.querySelectorAll<HTMLElement>(".page")]
    .filter((page) => pageNumber(page) >= pageNumber(anchor.page))
    .sort((left, right) => pageNumber(left) - pageNumber(right))
  const selected: string[] = []
  let complete = false
  for (const page of pages) {
    for (const span of visibleBodySpans(page)) {
      if (page === anchor.page && span.top < anchor.top + anchor.height - 2) continue
      const candidate = sectionId(span.text)
      if (candidate && candidate !== target && candidate.split(".").length <= targetLevel) {
        complete = true
        break
      }
      if (span.height >= Math.max(7, anchor.height * 0.42)) selected.push(span.text)
    }
    if (complete) break
  }
  const value = boundedContext(
    normalizeExtractedPdfText(`대상 절 ${target}. ${selected.join(" ")}`),
    maximumCharacters,
  )
  if (value) cache.set(cacheKey, value)
  return value
}
