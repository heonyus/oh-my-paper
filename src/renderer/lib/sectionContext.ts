import { normalizeExtractedPdfText } from "./pdfTextLines"
import { hierarchicalSectionContext, nearestSectionAnchor } from "./sectionHierarchy"

const maximumSectionContextCharacters = 7_800
const maximumPaperContextCharacters = 1_600

type Bounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type SectionRequestContextInput = {
  readonly viewer: HTMLElement
  readonly page: HTMLElement
  readonly heading: string
  readonly bounds: Bounds
  readonly paperTitle: string
}

type PositionedText = {
  readonly text: string
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function positionedText(page: HTMLElement): readonly PositionedText[] {
  const pageRect = page.getBoundingClientRect()
  return [...page.querySelectorAll<HTMLElement>(".textLayer span")]
    .map((span) => {
      const rect = span.getBoundingClientRect()
      return {
        text: span.textContent?.trim() ?? "",
        left: rect.left - pageRect.left,
        top: rect.top - pageRect.top,
        width: rect.width,
        height: rect.height,
      }
    })
    .filter((span) => span.text)
    .sort((left, right) => left.top - right.top || left.left - right.left)
}

function paperOverview(viewer: HTMLElement, paperTitle: string): string {
  const firstPage = viewer.querySelector<HTMLElement>('.page[data-page-number="1"]')
  if (!firstPage) return paperTitle
  const pageText = normalizeExtractedPdfText(
    positionedText(firstPage)
      .map((span) => span.text)
      .join(" "),
  )
  const lower = pageText.toLocaleLowerCase()
  const abstractStart = lower.indexOf("abstract")
  const introductionStart = lower.indexOf("introduction", Math.max(0, abstractStart + 8))
  const abstract =
    abstractStart < 0
      ? pageText.slice(0, maximumPaperContextCharacters)
      : pageText.slice(
          abstractStart + "abstract".length,
          introductionStart > abstractStart ? introductionStart : abstractStart + 1_000,
        )
  return normalizeExtractedPdfText(`${paperTitle}. ${abstract}`).slice(
    0,
    maximumPaperContextCharacters,
  )
}

export function sectionRequestContext(input: SectionRequestContextInput): {
  readonly paper: string
  readonly section: string
} {
  const anchor = {
    page: input.page,
    heading: input.heading,
    top: input.bounds.y,
    left: input.bounds.x,
    width: input.bounds.width,
    height: input.bounds.height,
  }
  return {
    paper: paperOverview(input.viewer, input.paperTitle),
    section: hierarchicalSectionContext({
      viewer: input.viewer,
      anchor,
      maximumCharacters: maximumSectionContextCharacters,
    }),
  }
}

function intersectsBounds(span: PositionedText, bounds: Bounds): boolean {
  return (
    span.left < bounds.x + bounds.width &&
    span.left + span.width > bounds.x &&
    span.top < bounds.y + bounds.height &&
    span.top + span.height > bounds.y
  )
}

export function featureRequestContext(
  page: HTMLElement,
  bounds: Bounds,
  viewer?: HTMLElement,
): string {
  const spans = positionedText(page)
  const bodyHeights = spans.map((span) => span.height).filter((height) => height >= 7)
  const sortedHeights = [...bodyHeights].sort((left, right) => left - right)
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] ?? 12
  const headings = spans.filter(
    (span) => span.height >= medianHeight * 1.25 && span.text.length <= 180,
  )
  const preceding = headings.filter((span) => span.top < bounds.y).at(-1)
  const following = headings.find((span) => span.top > bounds.y + bounds.height)
  const minimumTop = preceding?.top ?? Math.max(0, bounds.y - 500)
  const maximumTop = following?.top ?? bounds.y + bounds.height + 500
  const prose = spans
    .filter((span) => span.top >= minimumTop && span.top < maximumTop)
    .filter((span) => !intersectsBounds(span, bounds))
    .map((span) => span.text)
    .join(" ")
  const local = normalizeExtractedPdfText(prose)
  if (!viewer) return local.slice(0, maximumSectionContextCharacters)
  const anchor = nearestSectionAnchor(viewer, page, bounds.y)
  if (!anchor) return local.slice(0, maximumSectionContextCharacters)
  const section = hierarchicalSectionContext({
    viewer,
    anchor,
    maximumCharacters: maximumSectionContextCharacters - Math.min(local.length, 1_800) - 40,
  })
  return `[근처 문맥] ${local.slice(0, 1_800)}\n\n[현재 절 전체] ${section}`.slice(
    0,
    maximumSectionContextCharacters,
  )
}
