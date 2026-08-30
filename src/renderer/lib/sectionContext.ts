import { normalizeExtractedPdfText } from "./pdfTextLines"

const maximumSectionContextCharacters = 1_800
const maximumPaperContextCharacters = 900

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

function proseFromPage(page: HTMLElement, minimumTop: number, minimumTextHeight: number): string {
  const pageHeight = page.getBoundingClientRect().height
  const selected: string[] = []
  for (const span of positionedText(page)) {
    if (span.top < minimumTop || span.top < pageHeight * 0.065) continue
    if (span.top > pageHeight * 0.93) continue
    if (span.height < minimumTextHeight) continue
    if (selected.length > 0 && /^\d+(?:\.\d+)+$/u.test(span.text)) break
    selected.push(span.text)
  }
  return normalizeExtractedPdfText(selected.join(" "))
}

function followingPage(page: HTMLElement): HTMLElement | null {
  let sibling = page.nextElementSibling
  while (sibling) {
    if (sibling instanceof HTMLElement && sibling.classList.contains("page")) return sibling
    sibling = sibling.nextElementSibling
  }
  return null
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
  const minimumTextHeight = Math.max(8, input.bounds.height * 0.58)
  const current = proseFromPage(
    input.page,
    input.bounds.y + input.bounds.height - 2,
    minimumTextHeight,
  )
  const nextPage = followingPage(input.page)
  const continuation = nextPage ? proseFromPage(nextPage, 0, minimumTextHeight) : ""
  return {
    paper: paperOverview(input.viewer, input.paperTitle),
    section: normalizeExtractedPdfText(`${current} ${continuation}`).slice(
      0,
      maximumSectionContextCharacters,
    ),
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

export function featureRequestContext(page: HTMLElement, bounds: Bounds): string {
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
  return normalizeExtractedPdfText(prose).slice(0, maximumSectionContextCharacters)
}
