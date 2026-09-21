import { detectFiguresAndTables } from "./pdfCaptionFeatureDetection"
import { detectDisplayEquations } from "./pdfEquationDetection"
import { refinePdfFeatures } from "./pdfFeatureRefinement"
import { detectFrontMatter } from "./pdfFrontMatter"
import { headingLevel, isSectionHeadingSpan, normalizedHeadingText } from "./pdfHeadingClassifier"
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

const CITATION_PATTERN = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/gu
const AUTHOR_YEAR_CITATION_PATTERN =
  /\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'-]+(?:\s+et al\.|,)\s*,?\s*(?:19|20)\d{2}[a-z]?\b/gu

function extractCitations(span: PdfTextSpan, pageNumber: number): readonly PdfFeature[] {
  const features: PdfFeature[] = []
  const matches = [
    ...[...span.text.matchAll(CITATION_PATTERN)].map((match) => ({
      index: match.index,
      label: match[0],
    })),
    ...[...span.text.matchAll(AUTHOR_YEAR_CITATION_PATTERN)].map((match) => ({
      index: match.index,
      label: match[0],
    })),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
  for (const match of matches) {
    if (match.index === undefined || span.text.length === 0) continue
    const startRatio = Math.max(0, Math.min(1, match.index / span.text.length))
    const widthRatio = Math.max(0, Math.min(1, match.label.length / span.text.length))
    const tokenX = span.x + startRatio * span.width
    const tokenWidth = Math.max(14, widthRatio * span.width)
    features.push({
      kind: "citation",
      pageNumber,
      rect: { x: tokenX, y: span.y, width: tokenWidth, height: span.height },
      label: match.label,
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
    const text = normalizedHeadingText(span.text)
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

    const level = headingLevel(text)
    if (level && isSectionHeadingSpan({ ...span, text }, pageWidth)) {
      features.push({
        kind: level,
        pageNumber,
        rect: { x: span.x, y: span.y, width: span.width, height: span.height },
        label: text,
        context: text,
        priority: level === "subheading" ? 0.85 : 0.9,
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

  const captionIds = new Set(
    figTab.features
      .map((feature) => feature.sourceSpanIds[0])
      .filter((id): id is string => id !== undefined),
  )
  const citations = sorted
    .filter((span) => !consumedAll.has(span.id) || captionIds.has(span.id))
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
