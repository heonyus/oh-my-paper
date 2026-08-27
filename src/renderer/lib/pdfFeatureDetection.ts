import { detectDisplayEquations } from "./pdfEquationDetection"
import { detectFiguresAndTables, refinePdfFeatures } from "./pdfFeatureRefinement"
import { detectFrontMatter } from "./pdfFrontMatter"
import {
  type BoundingBox,
  type ConnectedVisualBoundsOptions,
  computeConnectedVisualBounds,
  type VisualComponent,
} from "./pdfVisualBounds"

export type { BoundingBox, ConnectedVisualBoundsOptions, VisualComponent }
export { computeConnectedVisualBounds }

export type PdfFeatureRect = BoundingBox
export interface PdfTextSpan {
  readonly id: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly fontSize: number
  readonly fontWeight: number
  readonly rotation?: number
}

export type PdfFeatureKind = "heading" | "subheading" | "equation" | "citation" | "figure" | "table"

export interface PdfFeature {
  readonly kind: PdfFeatureKind
  readonly pageNumber: number
  readonly rect: PdfFeatureRect
  readonly label: string
  readonly context: string
  readonly priority: number
  readonly sourceSpanIds: readonly string[]
}

export interface DetectPdfFeaturesInput {
  readonly pageNumber: number
  readonly pageWidth: number
  readonly pageHeight: number
  readonly spans: readonly PdfTextSpan[]
}

const NAMED_SECTIONS =
  /^(?:Abstract|Introduction|Background|Related\s+Work|Methodology|Methods|Framework|Approach|Model|Architecture|System|Experiments|Experimental\s+Setup|Results|Evaluation|Discussion|Analysis|Ablation(?:\s+Stud(?:y|ies))?|Conclusions?|Future\s+Work|Limitations|Ethical\s+Considerations|Broader\s+Impacts?|References|Bibliography|Appendix|Appendices|Acknowledgements?)$/iu

const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)\.?\s+([A-Z][-:,/\w\s]{1,80})$/u
const APPENDIX_HEADING =
  /^([A-Z])((?:\.\d+)*)\.?\s+([A-Z][A-Za-z-]{2,}(?:\s+(?:[A-Z][A-Za-z-]*|and|of|for|in|with|to)){0,7})$/u

function isAuthorOrAffiliation(text: string): boolean {
  if (
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|http|www|arXiv:|University|Institute|Laboratory|Department|School|College|Hospital|Center|Author|Contribution/iu.test(
      text,
    )
  ) {
    return true
  }
  if (/^[♠♦†*∗,\s]+$/u.test(text) || /\{[\w,]+\}/u.test(text)) {
    return true
  }
  return false
}

function isProse(text: string): boolean {
  if (/^[a-z]/u.test(text)) return true
  if (/[.?!]$/u.test(text) && text.length >= 30) return true
  if (/^[-*–—•●○◦]|^\([a-z0-9]+\)|^\d+\)/iu.test(text)) return true
  if (/\b(?:we\s+propose|in\s+this\s+paper|confirmed\s+that|through\s+clinical)\b/iu.test(text)) {
    return true
  }
  return false
}

const CITATION_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/gu

function extractCitations(span: PdfTextSpan, pageNumber: number): readonly PdfFeature[] {
  const features: PdfFeature[] = []
  const matches = span.text.matchAll(CITATION_PATTERN)
  for (const match of matches) {
    if (match.index === undefined || span.text.length === 0) continue
    const startRatio = Math.max(0, Math.min(1, match.index / span.text.length))
    const widthRatio = Math.max(0, Math.min(1, match[0].length / span.text.length))
    const tokenX = span.x + startRatio * span.width
    const tokenWidth = Math.max(14, widthRatio * span.width)
    features.push({
      kind: "citation",
      pageNumber,
      rect: { x: tokenX, y: span.y, width: tokenWidth, height: span.height },
      label: match[0],
      context: span.text,
      priority: 0.5,
      sourceSpanIds: [span.id],
    })
  }
  return features
}

function detectSections(
  spans: readonly PdfTextSpan[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  consumedIds: ReadonlySet<string>,
): readonly PdfFeature[] {
  const features: PdfFeature[] = []
  for (const span of spans) {
    if (consumedIds.has(span.id)) continue
    const text = span.text.trim()
    if (!text) continue
    if (isAuthorOrAffiliation(text)) continue
    const fontSize = (span.fontSize * 600) / pageWidth

    const isDocTitle =
      pageNumber === 1 &&
      span.y < pageHeight * 0.16 &&
      fontSize >= 15 &&
      !isAuthorOrAffiliation(text)
    if (isDocTitle) {
      features.push({
        kind: "heading",
        pageNumber,
        rect: { x: span.x, y: span.y, width: span.width, height: span.height },
        label: text,
        context: text,
        priority: 0.95,
        sourceSpanIds: [span.id],
      })
      continue
    }

    if (fontSize < 10.5) continue
    if (isProse(text)) continue

    if (NAMED_SECTIONS.test(text)) {
      features.push({
        kind: "heading",
        pageNumber,
        rect: { x: span.x, y: span.y, width: span.width, height: span.height },
        label: text,
        context: text,
        priority: 0.9,
        sourceSpanIds: [span.id],
      })
      continue
    }

    const numMatch = text.match(NUMBERED_HEADING)
    if (numMatch?.[1] && Number(numMatch[1].split(".")[0]) <= 99) {
      const isSub = numMatch[1].includes(".")
      features.push({
        kind: isSub ? "subheading" : "heading",
        pageNumber,
        rect: { x: span.x, y: span.y, width: span.width, height: span.height },
        label: text,
        context: text,
        priority: isSub ? 0.85 : 0.9,
        sourceSpanIds: [span.id],
      })
      continue
    }

    const appendixMatch = text.match(APPENDIX_HEADING)
    if (appendixMatch?.[1]) {
      const isSub = Boolean(appendixMatch[2])
      features.push({
        kind: isSub ? "subheading" : "heading",
        pageNumber,
        rect: { x: span.x, y: span.y, width: span.width, height: span.height },
        label: text,
        context: text,
        priority: isSub ? 0.85 : 0.9,
        sourceSpanIds: [span.id],
      })
    }
  }
  return features
}

export function detectPdfFeatures(input: DetectPdfFeaturesInput): readonly PdfFeature[] {
  const validSpans = input.spans.filter((span) => span.text.trim().length > 0)
  if (validSpans.length === 0) return []

  const sorted = [...validSpans].sort((a, b) => a.y - b.y || a.x - b.x)
  const frontMatter = detectFrontMatter(sorted, input.pageNumber, input.pageHeight)
  const equations = detectDisplayEquations(
    sorted,
    input.pageNumber,
    input.pageWidth,
    input.pageHeight,
    frontMatter.consumed,
  )
  const equationIds = new Set(equations.flatMap((feature) => feature.sourceSpanIds))
  const figTab = detectFiguresAndTables(
    sorted,
    input.pageNumber,
    input.pageWidth,
    input.pageHeight,
    new Set([...frontMatter.consumed, ...equationIds]),
  )
  const consumedAll = new Set([...frontMatter.consumed, ...figTab.consumed, ...equationIds])

  const citations = sorted
    .filter((s) => !consumedAll.has(s.id))
    .flatMap((s) => extractCitations(s, input.pageNumber))
  const sections = detectSections(
    sorted,
    input.pageNumber,
    input.pageWidth,
    input.pageHeight,
    consumedAll,
  )

  const all = [...frontMatter.features, ...figTab.features, ...equations, ...citations, ...sections]
  return refinePdfFeatures(all, sorted, input.pageWidth)
}
