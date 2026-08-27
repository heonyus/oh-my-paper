import type { PdfFeature, PdfTextSpan } from "./pdfFeatureDetection"

const NAMED_SECTION =
  /^(?:Abstract|Introduction|Background|Related\s+Work|Methodology|Methods|Framework|Approach|Model|Architecture|System|Experiments|Results|Evaluation|Discussion|Analysis|Conclusions?|References|Bibliography|Appendix|Acknowledgements?)$/iu
const NUMBERED_HEADING = /^\d+(?:\.\d+)*\.?\s+[A-Z]/u
const METADATA =
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|http|www|arXiv:|University|Institute|Laboratory|Department|School|College|Hospital|Center|Author|Contribution|^[♠♦†*∗,\s]+$|\{[\w,]+\}/iu

function titleFeature(spans: readonly PdfTextSpan[], pageNumber: number): PdfFeature | null {
  if (spans.length === 0) return null
  const x = Math.min(...spans.map((span) => span.x))
  const y = Math.min(...spans.map((span) => span.y))
  const right = Math.max(...spans.map((span) => span.x + span.width))
  const bottom = Math.max(...spans.map((span) => span.y + span.height))
  const label = spans.map((span) => span.text.trim()).join(" ")
  return {
    kind: "heading",
    pageNumber,
    rect: { x, y, width: right - x, height: bottom - y },
    label,
    context: label,
    priority: 0.95,
    sourceSpanIds: spans.map((span) => span.id),
  }
}

export function detectFrontMatter(
  spans: readonly PdfTextSpan[],
  pageNumber: number,
  pageHeight: number,
): { readonly features: readonly PdfFeature[]; readonly consumed: ReadonlySet<string> } {
  if (pageNumber !== 1) return { features: [], consumed: new Set() }
  const upright = spans.filter((span) => Math.abs(span.rotation ?? 0) % 180 < 15)
  const sectionY = upright.find((span) => NAMED_SECTION.test(span.text.trim()))?.y
  const candidates = upright.filter((span) => span.y < (sectionY ?? pageHeight * 0.32))
  const maxFont = Math.max(0, ...candidates.map((span) => span.fontSize))
  const title = candidates.filter((span) => {
    const text = span.text.trim()
    return (
      span.y < pageHeight * 0.17 &&
      span.fontSize >= maxFont * 0.88 &&
      !METADATA.test(text) &&
      !NAMED_SECTION.test(text) &&
      !NUMBERED_HEADING.test(text)
    )
  })
  if (title.length === 0) return { features: [], consumed: new Set() }
  const titleBottom = Math.max(...title.map((span) => span.y + span.height))
  const metadata = candidates.filter(
    (span) => !title.includes(span) && span.y >= titleBottom && span.text.trim().length > 1,
  )
  const heading = titleFeature(title, pageNumber)
  const features = heading ? [heading] : []
  return {
    features,
    consumed: new Set([...title, ...metadata].map((span) => span.id)),
  }
}
